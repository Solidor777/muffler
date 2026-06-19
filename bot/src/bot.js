/**
 * Discord bot for the Muffler module.
 *
 * Registers two guild slash commands:
 *   /muffler join  - Joins the invoking member's current voice channel and begins
 *                    relaying per-user speaking state to connected WebSocket clients.
 *   /muffler leave - Destroys the active voice connection and stops relaying.
 *
 * Voice speaking detection uses @discordjs/voice receiver.speaking events (Opcode 5).
 * No audio is decoded — speaking start/end triggers are sufficient for ducking purposes.
 *
 * NOTE: Reliable 'end' events from receiver.speaking require that the bot subscribe to
 * each speaker's audio stream. The stream is created and immediately discarded (piped to
 * nowhere); the subscription itself is the mechanism that causes Discord to send silence
 * frames, which in turn triggers the 'end' event reliably.
 */

import { Client, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';

/** @typedef {import('./relay.js').RelayHandle} RelayHandle */
/** @typedef {import('./config.js').MufflerConfig} MufflerConfig */

/** @type {SlashCommandBuilder} - Top-level /muffler command with join/leave subcommands. */
const mufflerCommand = new SlashCommandBuilder()
    .setName('muffler')
    .setDescription('Controls Muffler voice channel connection.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
        sub
            .setName('join')
            .setDescription('Join your current voice channel and start relaying speaking state.')
    )
    .addSubcommand((sub) =>
        sub
            .setName('leave')
            .setDescription('Leave the voice channel and stop relaying.')
    );

/**
 * Initializes the Discord bot: registers slash commands with the target guild, wires
 * voice events to the relay, and logs in.
 *
 * @param {MufflerConfig} config - Validated bot configuration.
 * @param {RelayHandle}   relay  - Relay handle returned by createRelay().
 * @returns {Promise<void>} Resolves once the bot is fully logged in.
 */
export async function startBot(config, relay) {
    // Register guild commands via REST before the client connects — commands may take
    // a few seconds to propagate but are available immediately for testing.
    const rest = new REST({ version: '10' }).setToken(config.discordToken);
    await rest.put(
        Routes.applicationGuildCommands(config.discordAppId, config.discordGuildId),
        { body: [mufflerCommand.toJSON()] }
    );
    console.log('[bot] Slash commands registered.');

    /** @type {Client} - discord.js client with voice state tracking intent. */
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    /**
     * Active voice connection for the current guild session, or null when not connected.
     * Only one connection is managed at a time since this bot serves a single guild.
     *
     * @type {import('@discordjs/voice').VoiceConnection|null}
     */
    let activeConnection = null;

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'muffler') {
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'join') {
            /** @type {import('discord.js').GuildMember|null} - Member who invoked the command. */
            const member = interaction.member;
            const voiceChannel = member?.voice?.channel;

            if (!voiceChannel) {
                await interaction.reply({
                    content: 'You must be in a voice channel to use /muffler join.',
                    ephemeral: true,
                });
                return;
            }

            if (activeConnection) {
                activeConnection.destroy();
                activeConnection = null;
            }

            activeConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true,
            });

            // Wait for the connection to become ready before subscribing to speaking events.
            try {
                await entersState(activeConnection, VoiceConnectionStatus.Ready, 15_000);
            } catch {
                activeConnection.destroy();
                activeConnection = null;
                await interaction.reply({
                    content: 'Failed to join voice channel — connection timed out.',
                    ephemeral: true,
                });
                return;
            }

            // Handle voice drops: try to recover briefly, otherwise tear down and clear state
            // so connected clients release any active duck.
            const connection = activeConnection;
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch {
                    connection.destroy();
                    if (activeConnection === connection) {
                        activeConnection = null;
                    }
                    relay.reset();
                }
            });

            const { receiver } = activeConnection;

            receiver.speaking.on('start', (userId) => {
                // Subscribing to the user's audio stream is required for reliable 'end' events:
                // Discord only sends silence frames (which trigger 'end') when the bot actively
                // receives the stream. The stream is discarded — no audio is decoded or stored.
                const stream = receiver.subscribe(userId, { end: { behavior: 0 } });
                stream.resume(); // Drain immediately; prevents buffering.

                relay.setSpeaking(userId, true);
            });

            receiver.speaking.on('end', (userId) => {
                relay.setSpeaking(userId, false);
            });

            await interaction.reply({
                content: `Joined **${voiceChannel.name}** and relaying speaking state.`,
                ephemeral: true,
            });

        } else if (subcommand === 'leave') {
            if (!activeConnection) {
                await interaction.reply({
                    content: 'Not currently in a voice channel.',
                    ephemeral: true,
                });
                return;
            }

            activeConnection.destroy();
            activeConnection = null;
            relay.reset();
            await interaction.reply({ content: 'Left the voice channel.', ephemeral: true });
        }
    });

    client.once('ready', () => {
        console.log(`[bot] Logged in as ${client.user?.tag}.`);
    });

    await client.login(config.discordToken);
}
