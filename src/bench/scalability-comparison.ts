/**
 * Multi-Node Scalability Comparison
 *
 * This script helps demonstrate scalability by running benchmarks
 * with different cluster sizes (3, 5, 7 nodes).
 *
 * Usage:
 *   bun run src/bench/scalability-comparison.ts
 *
 * Prerequisites:
 *   - Start the appropriate number of nodes before running each test
 *   - Configure the CLUSTER_NODES environment variable appropriately
 */

import { logger } from "../utils";

interface NodeConfig {
    count: number;
    nodes: string[];
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

// Build configurations from environment
function buildConfigurations(): NodeConfig[] {
    const allNodes = getNodesFromEnv();
    const configs: NodeConfig[] = [];

    // Test with 3 nodes if we have at least 3
    if (allNodes.length >= 3) {
        configs.push({
            count: 3,
            nodes: allNodes.slice(0, 3)
        });
    }

    // Test with 5 nodes if we have at least 5
    if (allNodes.length >= 5) {
        configs.push({
            count: 5,
            nodes: allNodes.slice(0, 5)
        });
    }

    // Test with all nodes if more than 5
    if (allNodes.length > 5) {
        configs.push({
            count: allNodes.length,
            nodes: allNodes
        });
    }

    // If we have exactly the number of nodes, just test that
    if (configs.length === 0 || configs[configs.length - 1]!.count !== allNodes.length) {
        configs.push({
            count: allNodes.length,
            nodes: allNodes
        });
    }

    return configs;
}

interface TestResult {
    nodeCount: number;
    avgLatency: number;
    throughput: number;
    successRate: number;
    leaderElectionTime: number;
}

class SimpleClient {
    private ws: WebSocket | null = null;
    private userId: string;
    private connected = false;
    private roomCode: string | null = null;

    constructor(private url: string) {
        this.userId = `test-${Math.random().toString(36).substring(7)}`;
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);

            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    this.connected = true;
                };

                this.ws.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "CONNECTED") {
                        clearTimeout(timeout);
                        resolve(true);
                    }
                    if (msg.type === "ROOM_CREATED") {
                        this.roomCode = msg.payload.roomCode;
                    }
                };

                this.ws.onerror = () => {
                    clearTimeout(timeout);
                    resolve(false);
                };
            } catch {
                clearTimeout(timeout);
                resolve(false);
            }
        });
    }

    disconnect(): void {
        this.ws?.close();
    }

    getRoomCode(): string | null {
        return this.roomCode;
    }

    async createRoom(): Promise<{ success: boolean; latency: number }> {
        return this.sendAndWait(
            "ROOM_CREATE",
            { userId: this.userId, username: "BenchUser" },
            "ROOM_CREATED"
        );
    }

    async joinRoom(code: string): Promise<{ success: boolean; latency: number }> {
        return this.sendAndWait(
            "ROOM_JOIN",
            { roomCode: code, userId: this.userId, username: "BenchUser" },
            "ROOM_JOINED"
        );
    }

    async sendChat(msg: string): Promise<{ success: boolean; latency: number }> {
        return this.sendAndWait(
            "CHAT_MESSAGE",
            { messageText: msg, userId: this.userId, username: "BenchUser" },
            "ROOM_STATE_UPDATE"
        );
    }

    private async sendAndWait(
        type: string,
        payload: unknown,
        expectType: string
    ): Promise<{ success: boolean; latency: number }> {
        return new Promise((resolve) => {
            const start = Date.now();
            const timeout = setTimeout(() => resolve({ success: false, latency: -1 }), 5000);

            const handler = (event: MessageEvent) => {
                const msg = JSON.parse(event.data);
                if (msg.type === expectType) {
                    clearTimeout(timeout);
                    this.ws!.removeEventListener("message", handler);
                    resolve({ success: true, latency: Date.now() - start });
                }
            };

            this.ws!.addEventListener("message", handler);
            this.ws!.send(JSON.stringify({ type, payload }));
        });
    }
}

async function measureLeaderElection(nodes: string[]): Promise<number> {
    // This measures how long it takes for a room to be created
    // which requires leader election in Raft
    const client = new SimpleClient(nodes[0]!);

    if (!(await client.connect())) {
        return -1;
    }

    const start = Date.now();
    const result = await client.createRoom();
    const elapsed = Date.now() - start;

    client.disconnect();

    return result.success ? elapsed : -1;
}

async function runQuickBenchmark(nodes: string[]): Promise<{
    avgLatency: number;
    throughput: number;
    successRate: number;
}> {
    const client = new SimpleClient(nodes[0]!);

    if (!(await client.connect())) {
        return { avgLatency: -1, throughput: 0, successRate: 0 };
    }

    const createResult = await client.createRoom();
    if (!createResult.success) {
        client.disconnect();
        return { avgLatency: -1, throughput: 0, successRate: 0 };
    }

    const latencies: number[] = [];
    let successes = 0;
    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
        const result = await client.sendChat(`Test message ${i}`);
        if (result.success) {
            successes++;
            latencies.push(result.latency);
        }
    }

    const duration = (Date.now() - start) / 1000;
    client.disconnect();

    return {
        avgLatency:
            latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : -1,
        throughput: iterations / duration,
        successRate: (successes / iterations) * 100
    };
}

async function testConfiguration(config: NodeConfig): Promise<TestResult | null> {
    logger.log(`\n📊 Testing with ${config.count} nodes...`);

    // Check if nodes are available
    const availableNodes: string[] = [];
    for (const node of config.nodes) {
        const client = new SimpleClient(node);
        if (await client.connect()) {
            availableNodes.push(node);
            client.disconnect();
        }
    }

    if (availableNodes.length < config.count) {
        logger.log(`  ⚠️  Only ${availableNodes.length}/${config.count} nodes available`);
        if (availableNodes.length === 0) {
            logger.log(`  ✗ Skipping - no nodes available`);
            return null;
        }
    }

    // Measure leader election time
    const electionTime = await measureLeaderElection(availableNodes);
    logger.log(`  Leader election: ${electionTime}ms`);

    // Run benchmark
    const benchmark = await runQuickBenchmark(availableNodes);
    logger.log(`  Avg latency: ${benchmark.avgLatency.toFixed(2)}ms`);
    logger.log(`  Throughput: ${benchmark.throughput.toFixed(2)} ops/sec`);
    logger.log(`  Success rate: ${benchmark.successRate.toFixed(1)}%`);

    return {
        nodeCount: availableNodes.length,
        avgLatency: benchmark.avgLatency,
        throughput: benchmark.throughput,
        successRate: benchmark.successRate,
        leaderElectionTime: electionTime
    };
}

async function main(): Promise<void> {
    logger.log("=".repeat(60));
    logger.log("  Scalability Comparison Test");
    logger.log("=".repeat(60));
    logger.log("\nThis test compares performance across different cluster sizes.");
    logger.log("Make sure to start the appropriate number of nodes before each test.\n");

    const configurations = buildConfigurations();
    logger.log(`Loaded ${configurations.length} configuration(s) from CLUSTER_NODES env`);
    for (const cfg of configurations) {
        logger.log(`  - ${cfg.count} nodes: ${cfg.nodes.join(", ")}`);
    }

    const results: TestResult[] = [];

    // Test each configuration
    for (const config of configurations) {
        const result = await testConfiguration(config);
        if (result) {
            results.push(result);
        }
    }

    // Print comparison
    if (results.length > 0) {
        logger.log("\n" + "=".repeat(60));
        logger.log("  COMPARISON SUMMARY");
        logger.log("=".repeat(60) + "\n");

        logger.log(
            "Nodes".padEnd(8) +
                "Latency (ms)".padStart(15) +
                "Throughput".padStart(15) +
                "Success %".padStart(12) +
                "Election".padStart(12)
        );
        logger.log("-".repeat(62));

        for (const r of results) {
            logger.log(
                r.nodeCount.toString().padEnd(8) +
                    r.avgLatency.toFixed(2).padStart(15) +
                    `${r.throughput.toFixed(2)}/s`.padStart(15) +
                    `${r.successRate.toFixed(1)}%`.padStart(12) +
                    `${r.leaderElectionTime}ms`.padStart(12)
            );
        }

        // Save results
        const filename = `scalability-results-${Date.now()}.json`;
        await Bun.write(filename, JSON.stringify(results, null, 2));
        logger.log(`\n✓ Results saved to ${filename}`);
    }
}

main().catch(console.error);
