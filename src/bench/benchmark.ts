/**
 * Benchmark suite for the Distributed YouTube Watch-Together System
 *
 * This benchmark measures:
 * 1. Throughput - Operations per second the system can handle
 * 2. Latency - Response time for different operations
 * 3. Scalability - Performance with increasing load
 * 4. Fault tolerance - Recovery time after node failure
 *
 * Usage:
 *   bun run src/bench/benchmark.ts [options]
 *
 * Options:
 *   --nodes       Comma-separated WebSocket URLs (overrides CLUSTER_NODES env)
 *   --test        Which test to run: all, throughput, latency, scalability, fault (default: all)
 *   --duration    Duration of throughput test in seconds (default: 10)
 *   --clients     Number of concurrent clients for load test (default: 10)
 *   --output      Output file for results (default: benchmark-results.json)
 *
 * Environment:
 *   CLUSTER_NODES - Node configuration (format: nodeId:host:port:rpcPort,...)
 */

import { logger } from "../utils";
import { RoomMessageType, ClientMessageType } from "../../shared/types";

// Configuration
interface BenchmarkConfig {
    nodes: string[];
    testType: "all" | "throughput" | "latency" | "scalability" | "fault";
    duration: number;
    clients: number;
    outputFile: string;
}

interface LatencyResult {
    operation: string;
    samples: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}

interface ThroughputResult {
    operation: string;
    totalOperations: number;
    durationSeconds: number;
    opsPerSecond: number;
    successRate: number;
}

interface ScalabilityResult {
    clientCount: number;
    throughput: number;
    avgLatency: number;
    errorRate: number;
}

interface BenchmarkResults {
    timestamp: string;
    nodeCount: number;
    nodes: string[];
    latency: LatencyResult[];
    throughput: ThroughputResult[];
    scalability: ScalabilityResult[];
    faultTolerance?: {
        recoveryTimeMs: number;
        dataConsistency: boolean;
    };
}

/**
 * Parse CLUSTER_NODES environment variable to get WebSocket URLs
 * Format: nodeId:host:port:rpcPort,nodeId:host:port:rpcPort,...
 */
function getNodesFromEnv(): string[] {
    const nodesEnv = process.env.CLUSTER_NODES;

    if (!nodesEnv) {
        throw new Error(
            "CLUSTER_NODES environment variable is required.\n" +
                "Format: nodeId:host:port:rpcPort,nodeId:host:port:rpcPort,...\n" +
                "Example: CLUSTER_NODES=node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743"
        );
    }

    const nodeStrings = nodesEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    return nodeStrings.map((nodeStr) => {
        const parts = nodeStr.split(":");
        if (parts.length !== 4) {
            throw new Error(`Invalid node format: ${nodeStr}. Expected: nodeId:host:port:rpcPort`);
        }

        const host = parts[1]!;
        const port = parts[2]!;

        return `ws://${host}:${port}/ws`;
    });
}

// Parse command line arguments
function parseArgs(): BenchmarkConfig {
    const args = process.argv.slice(2);
    // Load nodes from CLUSTER_NODES env by default
    const config: BenchmarkConfig = {
        nodes: getNodesFromEnv(),
        testType: "all",
        duration: 10,
        clients: 10,
        outputFile: "benchmark-results.json"
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--nodes":
                config.nodes = args[++i]!.split(",");
                break;
            case "--test":
                config.testType = args[++i] as BenchmarkConfig["testType"];
                break;
            case "--duration":
                config.duration = parseInt(args[++i]!, 10);
                break;
            case "--clients":
                config.clients = parseInt(args[++i]!, 10);
                break;
            case "--output":
                config.outputFile = args[++i]!;
                break;
        }
    }

    return config;
}

// WebSocket client wrapper with latency tracking
class BenchmarkClient {
    private ws: WebSocket | null = null;
    private url: string;
    private userId: string;
    private username: string;
    private clientId: string = "";
    private roomCode: string | null = null;
    private connected: boolean = false;
    private lastStateUpdateTime: number = 0;

    constructor(url: string) {
        this.url = url;
        this.userId = `bench-user-${Math.random().toString(36).substring(7)}`;
        this.username = `BenchUser-${this.userId.slice(-4)}`;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            const timeout = setTimeout(() => {
                reject(new Error("Connection timeout"));
            }, 5000);

            this.ws.onopen = () => {
                this.connected = true;
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);

                if (message.type === ClientMessageType.CONNECTED) {
                    this.clientId = message.payload.clientId;
                    clearTimeout(timeout);
                    resolve();
                }

                if (message.type === ClientMessageType.ROOM_CREATED) {
                    this.roomCode = message.payload.roomCode;
                }

                if (message.type === ClientMessageType.ROOM_JOINED) {
                    this.roomCode = message.payload.roomCode;
                }

                if (message.type === ClientMessageType.ROOM_STATE_UPDATE) {
                    this.lastStateUpdateTime = Date.now();
                }
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(error);
            };

            this.ws.onclose = () => {
                this.connected = false;
            };
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    getRoomCode(): string | null {
        return this.roomCode;
    }

    private send(type: string, payload: unknown): void {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    // Wait for a specific response type
    private async waitForResponse(
        expectType: string,
        timeoutMs: number = 5000
    ): Promise<{ success: boolean; payload?: unknown }> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.ws?.removeEventListener("message", handler);
                resolve({ success: false });
            }, timeoutMs);

            const handler = (event: MessageEvent) => {
                const message = JSON.parse(event.data);
                if (message.type === expectType) {
                    clearTimeout(timeout);
                    this.ws?.removeEventListener("message", handler);
                    resolve({ success: true, payload: message.payload });
                }
            };

            this.ws?.addEventListener("message", handler);
        });
    }

    // Send and wait for response - for operations that need specific response
    private async sendAndWait(
        sendType: string,
        payload: unknown,
        expectType: string
    ): Promise<{ latency: number; success: boolean }> {
        const start = Date.now();
        this.send(sendType, payload);
        const result = await this.waitForResponse(expectType);
        return {
            latency: result.success ? Date.now() - start : -1,
            success: result.success
        };
    }

    // Send operation and wait for state update (for room operations)
    async sendRoomOperation(
        type: string,
        payload: unknown
    ): Promise<{ latency: number; success: boolean }> {
        if (!this.roomCode) {
            return { latency: -1, success: false };
        }

        const start = Date.now();
        this.send(type, payload);

        // Wait for state update with a shorter timeout
        const result = await this.waitForResponse(ClientMessageType.ROOM_STATE_UPDATE, 3000);
        return {
            latency: result.success ? Date.now() - start : -1,
            success: result.success
        };
    }

    // Operations
    async createRoom(): Promise<{ latency: number; success: boolean; roomCode?: string }> {
        const result = await this.sendAndWait(
            RoomMessageType.ROOM_CREATE,
            { userId: this.userId, username: this.username },
            ClientMessageType.ROOM_CREATED
        );
        return { ...result, roomCode: this.roomCode || undefined };
    }

    async joinRoom(roomCode: string): Promise<{ latency: number; success: boolean }> {
        this.roomCode = roomCode; // Set it before joining so operations can work
        return this.sendAndWait(
            RoomMessageType.ROOM_JOIN,
            { roomCode, userId: this.userId, username: this.username },
            ClientMessageType.ROOM_JOINED
        );
    }

    async addVideo(videoId: string, title: string): Promise<{ latency: number; success: boolean }> {
        return this.sendRoomOperation(RoomMessageType.PLAYLIST_ADD, {
            videoId,
            title,
            userId: this.userId,
            username: this.username,
            newVideoPosition: 0
        });
    }

    async sendChatMessage(message: string): Promise<{ latency: number; success: boolean }> {
        return this.sendRoomOperation(RoomMessageType.CHAT_MESSAGE, {
            messageText: message,
            userId: this.userId,
            username: this.username
        });
    }

    async playVideo(
        videoId: string,
        position: number
    ): Promise<{ latency: number; success: boolean }> {
        return this.sendRoomOperation(RoomMessageType.PLAYBACK_PLAY, {
            videoId,
            positionSeconds: position
        });
    }

    async pauseVideo(position: number): Promise<{ latency: number; success: boolean }> {
        return this.sendRoomOperation(RoomMessageType.PLAYBACK_PAUSE, {
            positionSeconds: position
        });
    }

    async seekVideo(position: number): Promise<{ latency: number; success: boolean }> {
        return this.sendRoomOperation(RoomMessageType.PLAYBACK_SEEK, {
            newPositionSeconds: position
        });
    }
}

// Calculate percentiles
function percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
}

// Latency benchmark
async function benchmarkLatency(config: BenchmarkConfig): Promise<LatencyResult[]> {
    logger.log("\n📊 Running Latency Benchmark...\n");

    const results: LatencyResult[] = [];
    const iterations = 50;

    const client = new BenchmarkClient(config.nodes[0]!);
    await client.connect();

    // Create room first
    const createResult = await client.createRoom();
    if (!createResult.success) {
        logger.error("Failed to create room for latency test");
        return results;
    }
    const roomCode = createResult.roomCode!;
    logger.log(`Created room: ${roomCode}`);

    // Test operations
    const operations = [
        { name: "CHAT_MESSAGE", fn: () => client.sendChatMessage(`Test message ${Date.now()}`) },
        { name: "PLAYLIST_ADD", fn: () => client.addVideo(`video-${Date.now()}`, "Test Video") },
        { name: "PLAYBACK_PLAY", fn: () => client.playVideo("video-test", 0) },
        { name: "PLAYBACK_PAUSE", fn: () => client.pauseVideo(10) },
        { name: "PLAYBACK_SEEK", fn: () => client.seekVideo(Math.random() * 100) }
    ];

    for (const op of operations) {
        const latencies: number[] = [];
        let successes = 0;

        logger.log(`  Testing ${op.name}...`);

        for (let i = 0; i < iterations; i++) {
            const result = await op.fn();
            if (result.success && result.latency > 0) {
                latencies.push(result.latency);
                successes++;
            }
            // Small delay between operations
            await new Promise((r) => setTimeout(r, 50));
        }

        if (latencies.length > 0) {
            results.push({
                operation: op.name,
                samples: latencies.length,
                min: Math.min(...latencies),
                max: Math.max(...latencies),
                avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
                p50: percentile(latencies, 50),
                p95: percentile(latencies, 95),
                p99: percentile(latencies, 99)
            });
            logger.log(
                `    ✓ ${op.name}: avg=${results[results.length - 1]!.avg.toFixed(
                    2
                )}ms, p95=${results[results.length - 1]!.p95.toFixed(2)}ms`
            );
        } else {
            logger.log(`    ✗ ${op.name}: No successful samples`);
        }
    }

    // Test room creation latency separately
    const createLatencies: number[] = [];
    logger.log(`  Testing CREATE_ROOM...`);
    for (let i = 0; i < 20; i++) {
        const testClient = new BenchmarkClient(config.nodes[i % config.nodes.length]!);
        try {
            await testClient.connect();
            const result = await testClient.createRoom();
            if (result.success && result.latency > 0) {
                createLatencies.push(result.latency);
            }
            testClient.disconnect();
        } catch (e) {
            // Ignore connection errors
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    if (createLatencies.length > 0) {
        results.push({
            operation: "CREATE_ROOM",
            samples: createLatencies.length,
            min: Math.min(...createLatencies),
            max: Math.max(...createLatencies),
            avg: createLatencies.reduce((a, b) => a + b, 0) / createLatencies.length,
            p50: percentile(createLatencies, 50),
            p95: percentile(createLatencies, 95),
            p99: percentile(createLatencies, 99)
        });
        logger.log(
            `    ✓ CREATE_ROOM: avg=${results[results.length - 1]!.avg.toFixed(2)}ms, p95=${results[
                results.length - 1
            ]!.p95.toFixed(2)}ms`
        );
    }

    client.disconnect();
    return results;
}

// Throughput benchmark
async function benchmarkThroughput(config: BenchmarkConfig): Promise<ThroughputResult[]> {
    logger.log("\n📊 Running Throughput Benchmark...\n");

    const results: ThroughputResult[] = [];
    const clientCount = Math.min(config.clients, 20);

    // Create clients
    const clients: BenchmarkClient[] = [];
    for (let i = 0; i < clientCount; i++) {
        const client = new BenchmarkClient(config.nodes[i % config.nodes.length]!);
        try {
            await client.connect();
            clients.push(client);
        } catch (e) {
            logger.error(`Failed to connect client ${i}`);
        }
    }

    if (clients.length === 0) {
        logger.error("No clients connected");
        return results;
    }

    logger.log(`Connected ${clients.length} clients`);

    // Have first client create a room, others join
    const createResult = await clients[0]!.createRoom();
    if (!createResult.success || !createResult.roomCode) {
        logger.error("Failed to create room");
        return results;
    }
    const roomCode = createResult.roomCode;
    logger.log(`Created room: ${roomCode}`);

    // Other clients join
    for (let i = 1; i < clients.length; i++) {
        await clients[i]!.joinRoom(roomCode);
        await new Promise((r) => setTimeout(r, 50));
    }
    logger.log(`All clients joined room`);

    // Throughput test for chat messages
    logger.log(`\n  Testing CHAT_MESSAGE throughput (${config.duration}s)...`);
    let chatOps = 0;
    let chatSuccesses = 0;
    const chatStartTime = Date.now();
    const chatEndTime = chatStartTime + config.duration * 1000;

    while (Date.now() < chatEndTime) {
        const promises = clients.map((client) =>
            client.sendChatMessage(`Throughput test ${Date.now()}`)
        );
        const results = await Promise.all(promises);
        chatOps += results.length;
        chatSuccesses += results.filter((r) => r.success).length;
        await new Promise((r) => setTimeout(r, 10)); // Small delay
    }

    const chatDuration = (Date.now() - chatStartTime) / 1000;
    results.push({
        operation: "CHAT_MESSAGE",
        totalOperations: chatOps,
        durationSeconds: chatDuration,
        opsPerSecond: chatOps / chatDuration,
        successRate: (chatSuccesses / chatOps) * 100
    });
    logger.log(
        `    ✓ CHAT_MESSAGE: ${(chatOps / chatDuration).toFixed(2)} ops/sec, ${(
            (chatSuccesses / chatOps) *
            100
        ).toFixed(1)}% success`
    );

    // Throughput test for playback operations
    logger.log(`  Testing PLAYBACK operations throughput (${config.duration}s)...`);
    let playbackOps = 0;
    let playbackSuccesses = 0;
    const playbackStartTime = Date.now();
    const playbackEndTime = playbackStartTime + config.duration * 1000;

    while (Date.now() < playbackEndTime) {
        // Rotate through play, pause, seek
        const operations = [
            () => clients[0]!.playVideo("test-video", Math.random() * 100),
            () => clients[0]!.pauseVideo(Math.random() * 100),
            () => clients[0]!.seekVideo(Math.random() * 100)
        ];

        for (const op of operations) {
            const result = await op();
            playbackOps++;
            if (result.success) playbackSuccesses++;
            await new Promise((r) => setTimeout(r, 20));
        }
    }

    const playbackDuration = (Date.now() - playbackStartTime) / 1000;
    results.push({
        operation: "PLAYBACK_OPERATIONS",
        totalOperations: playbackOps,
        durationSeconds: playbackDuration,
        opsPerSecond: playbackOps / playbackDuration,
        successRate: (playbackSuccesses / playbackOps) * 100
    });
    logger.log(
        `    ✓ PLAYBACK: ${(playbackOps / playbackDuration).toFixed(2)} ops/sec, ${(
            (playbackSuccesses / playbackOps) *
            100
        ).toFixed(1)}% success`
    );

    // Cleanup
    for (const client of clients) {
        client.disconnect();
    }

    return results;
}

// Scalability benchmark
async function benchmarkScalability(config: BenchmarkConfig): Promise<ScalabilityResult[]> {
    logger.log("\n📊 Running Scalability Benchmark...\n");

    const results: ScalabilityResult[] = [];
    const clientCounts = [1, 5, 10, 20, 50];

    for (const targetCount of clientCounts) {
        logger.log(`  Testing with ${targetCount} concurrent clients...`);

        const clients: BenchmarkClient[] = [];

        // Connect clients
        for (let i = 0; i < targetCount; i++) {
            const client = new BenchmarkClient(config.nodes[i % config.nodes.length]!);
            try {
                await client.connect();
                clients.push(client);
            } catch (e) {
                // Connection failed, continue
            }
        }

        if (clients.length === 0) {
            logger.log(`    ✗ Could not connect any clients`);
            continue;
        }

        // Create room and join
        const createResult = await clients[0]!.createRoom();
        if (!createResult.success || !createResult.roomCode) {
            logger.log(`    ✗ Failed to create room`);
            for (const c of clients) c.disconnect();
            continue;
        }

        const roomCode = createResult.roomCode;
        for (let i = 1; i < clients.length; i++) {
            await clients[i]!.joinRoom(roomCode);
            await new Promise((r) => setTimeout(r, 20));
        }

        // Measure throughput and latency
        const testDuration = 5; // seconds
        let totalOps = 0;
        let totalSuccesses = 0;
        const latencies: number[] = [];
        const startTime = Date.now();

        while (Date.now() - startTime < testDuration * 1000) {
            // Send messages sequentially from each client to avoid response matching issues
            for (const c of clients) {
                const r = await c.sendChatMessage(`Scale test ${Date.now()}`);
                totalOps++;
                if (r.success) {
                    totalSuccesses++;
                    if (r.latency > 0) latencies.push(r.latency);
                }
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        const avgLatency =
            latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : -1;

        results.push({
            clientCount: clients.length,
            throughput: totalOps / duration,
            avgLatency,
            errorRate: ((totalOps - totalSuccesses) / totalOps) * 100
        });

        logger.log(
            `    ✓ ${clients.length} clients: ${(totalOps / duration).toFixed(
                2
            )} ops/sec, ${avgLatency.toFixed(2)}ms avg latency, ${(
                ((totalOps - totalSuccesses) / totalOps) *
                100
            ).toFixed(1)}% errors`
        );

        // Cleanup
        for (const client of clients) {
            client.disconnect();
        }

        await new Promise((r) => setTimeout(r, 500)); // Wait between tests
    }

    return results;
}

// Fault tolerance benchmark (basic)
async function benchmarkFaultTolerance(
    config: BenchmarkConfig
): Promise<{ recoveryTimeMs: number; dataConsistency: boolean } | undefined> {
    logger.log("\n📊 Running Fault Tolerance Test...\n");
    logger.log("  ⚠️  Note: This test requires manual node shutdown during execution");
    logger.log("  ⚠️  The test will measure how the system handles node failures\n");

    if (config.nodes.length < 3) {
        logger.log("  ✗ Fault tolerance test requires at least 3 nodes");
        return undefined;
    }

    // Connect to first node
    const client1 = new BenchmarkClient(config.nodes[0]!);
    await client1.connect();

    // Create room
    const createResult = await client1.createRoom();
    if (!createResult.success || !createResult.roomCode) {
        logger.error("Failed to create room");
        return undefined;
    }
    const roomCode = createResult.roomCode;
    logger.log(`  Created room: ${roomCode}`);

    // Add some data
    await client1.addVideo("test-video-1", "Test Video 1");
    await client1.sendChatMessage("Test message before failure");
    logger.log("  Added initial data");

    // Connect to another node
    const client2 = new BenchmarkClient(config.nodes[1]!);
    await client2.connect();
    await client2.joinRoom(roomCode);
    logger.log(`  Client 2 joined from different node`);

    logger.log("\n  ⏸️  Now manually stop one of the backend nodes (not the leader if possible)");
    logger.log("  Press Enter when you've stopped a node...\n");

    // Wait for user input (in real scenario, you'd automate this)
    await new Promise<void>((resolve) => {
        const stdin = process.stdin;
        stdin.setRawMode?.(true);
        stdin.resume();
        stdin.once("data", () => {
            stdin.setRawMode?.(false);
            resolve();
        });
    });

    // Measure recovery time
    const recoveryStart = Date.now();
    let recovered = false;
    let recoveryAttempts = 0;

    while (!recovered && recoveryAttempts < 30) {
        try {
            const result = await client2.sendChatMessage("Recovery test message");
            if (result.success) {
                recovered = true;
            }
        } catch (e) {
            // Operation failed, try again
        }
        recoveryAttempts++;
        await new Promise((r) => setTimeout(r, 500));
    }

    const recoveryTime = recovered ? Date.now() - recoveryStart : -1;

    if (recovered) {
        logger.log(`  ✓ System recovered in ${recoveryTime}ms`);
    } else {
        logger.log(`  ✗ System did not recover within timeout`);
    }

    client1.disconnect();
    client2.disconnect();

    return {
        recoveryTimeMs: recoveryTime,
        dataConsistency: recovered
    };
}

// Print summary report
function printSummary(results: BenchmarkResults): void {
    logger.log("\n" + "=".repeat(60));
    logger.log("  BENCHMARK SUMMARY");
    logger.log("=".repeat(60) + "\n");

    logger.log(`Timestamp: ${results.timestamp}`);
    logger.log(`Node Count: ${results.nodeCount}`);
    logger.log(`Nodes: ${results.nodes.join(", ")}\n`);

    if (results.latency.length > 0) {
        logger.log("📊 LATENCY RESULTS");
        logger.log("-".repeat(60));
        logger.log(
            "Operation".padEnd(20) +
                "Avg (ms)".padStart(10) +
                "P50 (ms)".padStart(10) +
                "P95 (ms)".padStart(10) +
                "P99 (ms)".padStart(10)
        );
        for (const r of results.latency) {
            logger.log(
                r.operation.padEnd(20) +
                    r.avg.toFixed(2).padStart(10) +
                    r.p50.toFixed(2).padStart(10) +
                    r.p95.toFixed(2).padStart(10) +
                    r.p99.toFixed(2).padStart(10)
            );
        }
        logger.log("");
    }

    if (results.throughput.length > 0) {
        logger.log("📊 THROUGHPUT RESULTS");
        logger.log("-".repeat(60));
        logger.log("Operation".padEnd(25) + "Ops/sec".padStart(12) + "Success %".padStart(12));
        for (const r of results.throughput) {
            logger.log(
                r.operation.padEnd(25) +
                    r.opsPerSecond.toFixed(2).padStart(12) +
                    `${r.successRate.toFixed(1)}%`.padStart(12)
            );
        }
        logger.log("");
    }

    if (results.scalability.length > 0) {
        logger.log("📊 SCALABILITY RESULTS");
        logger.log("-".repeat(60));
        logger.log(
            "Clients".padEnd(10) +
                "Throughput".padStart(15) +
                "Avg Latency".padStart(15) +
                "Error Rate".padStart(12)
        );
        for (const r of results.scalability) {
            logger.log(
                r.clientCount.toString().padEnd(10) +
                    `${r.throughput.toFixed(2)} ops/s`.padStart(15) +
                    `${r.avgLatency.toFixed(2)} ms`.padStart(15) +
                    `${r.errorRate.toFixed(1)}%`.padStart(12)
            );
        }
        logger.log("");
    }

    if (results.faultTolerance) {
        logger.log("📊 FAULT TOLERANCE RESULTS");
        logger.log("-".repeat(60));
        logger.log(`Recovery Time: ${results.faultTolerance.recoveryTimeMs}ms`);
        logger.log(
            `Data Consistency: ${
                results.faultTolerance.dataConsistency ? "✓ Maintained" : "✗ Lost"
            }`
        );
        logger.log("");
    }

    logger.log("=".repeat(60));
}

// Main benchmark runner
async function main(): Promise<void> {
    const config = parseArgs();

    logger.log("=".repeat(60));
    logger.log("  Distributed System Benchmark Suite");
    logger.log("=".repeat(60));
    logger.log(`\nConfiguration:`);
    logger.log(`  Nodes: ${config.nodes.join(", ")}`);
    logger.log(`  Test Type: ${config.testType}`);
    logger.log(`  Duration: ${config.duration}s`);
    logger.log(`  Clients: ${config.clients}`);
    logger.log(`  Output: ${config.outputFile}`);

    const results: BenchmarkResults = {
        timestamp: new Date().toISOString(),
        nodeCount: config.nodes.length,
        nodes: config.nodes,
        latency: [],
        throughput: [],
        scalability: []
    };

    try {
        // Run selected tests
        if (config.testType === "all" || config.testType === "latency") {
            results.latency = await benchmarkLatency(config);
        }

        if (config.testType === "all" || config.testType === "throughput") {
            results.throughput = await benchmarkThroughput(config);
        }

        if (config.testType === "all" || config.testType === "scalability") {
            results.scalability = await benchmarkScalability(config);
        }

        if (config.testType === "fault") {
            results.faultTolerance = await benchmarkFaultTolerance(config);
        }

        // Print summary
        printSummary(results);

        // Save results to file
        await Bun.write(config.outputFile, JSON.stringify(results, null, 2));
        logger.log(`\n✓ Results saved to ${config.outputFile}`);
    } catch (error) {
        logger.error("Benchmark failed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
