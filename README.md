# Distributed YouTube Watch-Together System

University of Helsinki - Distributed Systems Course Project (Group 31)

A distributed YouTube watch-together system where users join a room using a 6-digit code and watch synchronized videos with basic chat features.

## Architecture

The system consists of:

-   **N Backend Nodes** - Configurable via environment variables
-   **Raft Consensus** - For leader election and log replication per room
-   **WebSocket** - For client connections
-   **RPC over HTTP** - For inter-node communication

Each room has:

-   Playlist
-   Current video & playback position
-   Play/pause state
-   Participants list
-   Chat log

## Project Structure

```
distributed-systems-project/
├── frontend/                     # React frontend application
│   ├── public/
│   └── src/
│       ├── components/           # UI components
│       │   └── ui/               # shadcn/ui components
│       ├── config/               # Frontend configuration
│       ├── context/              # React contexts
│       ├── hooks/                # Custom React hooks
│       ├── lib/                  # Utility libraries
│       ├── pages/                # Page components
│       ├── types/                # TypeScript types
│       └── utils/                # Utility functions
│
├── scripts/                      # Build/deployment scripts
│
├── shared/                       # Shared code between frontend/backend
│   ├── components/
│   └── types/
│
└── src/                          # Backend server application
    ├── bench/                    # Benchmark suite
    ├── config/                   # Cluster configuration
    ├── consensus/                # Raft consensus implementation
    ├── node/                     # Backend node server
    ├── room/                     # Room state management
    ├── rpc/                      # RPC communication layer
    ├── types/                    # TypeScript types
    └── utils/                    # Utility functions
```

## Prerequisites

-   [Bun](https://bun.sh/) runtime (v1.0+)
-   [Node.js](https://nodejs.org/) (for frontend)

## Installation

```bash
# Install backend dependencies
bun install

# Install frontend dependencies
cd frontend && bun install
```

## Configuration

The system requires environment variables to configure backend nodes and frontend connections.

### Backend Configuration

Create a `.env` file in the project root:

```env
# This node's ID (must match one entry in CLUSTER_NODES)
NODE_ID=node-a

# All nodes in the cluster
# Format: nodeId:host:port:rpcPort
CLUSTER_NODES=node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743
```

### Frontend Configuration

Create a `.env` file in the `frontend/` directory:

```env
# WebSocket URLs of the backend servers to connect to
VITE_NODES=ws://localhost:8741/ws,ws://localhost:8742/ws,ws://localhost:8743/ws
```

### Adding More Nodes

To run with 5 nodes instead of 3:

**Backend `.env`:**

```env
NODE_ID=node-a
CLUSTER_NODES=node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743,node-d:localhost:8744:9744,node-e:localhost:8745:9745
```

**Frontend `frontend/.env`:**

```env
VITE_NODES=ws://localhost:8741/ws,ws://localhost:8742/ws,ws://localhost:8743/ws,ws://localhost:8744/ws,ws://localhost:8745/ws
```

> **Note:** For Raft consensus, use an odd number of nodes (3, 5, 7...) for better fault tolerance.
>
> -   3 nodes: tolerates 1 failure
> -   5 nodes: tolerates 2 failures

## Running the System

### Start nodes individually

Each node requires the `CLUSTER_NODES` environment variable and its own `NODE_ID`:

```bash
# In separate terminals (PowerShell):
$env:CLUSTER_NODES="node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743"

$env:NODE_ID="node-a"; bun run src/index.ts
$env:NODE_ID="node-b"; bun run src/index.ts
$env:NODE_ID="node-c"; bun run src/index.ts
```

Or on Linux/macOS:

```bash
export CLUSTER_NODES="node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743"

NODE_ID=node-a bun run src/index.ts
NODE_ID=node-b bun run src/index.ts
NODE_ID=node-c bun run src/index.ts
```

Alternatively, use a `.env` file and pass the node ID as a command line argument:

```bash
bun run src/index.ts node-a
bun run src/index.ts node-b
bun run src/index.ts node-c
```

### Start frontend

```bash
bun run frontend:dev
```

## Client WebSocket API

### Messages sent by client

| Message Type      | Payload                                                                           | Description                |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------- |
| `CREATE_ROOM`     | `{}`                                                                              | Create a new room          |
| `JOIN_ROOM`       | `{ roomCode: string }`                                                            | Join an existing room      |
| `LEAVE_ROOM`      | `{ roomCode: string }`                                                            | Leave the current room     |
| `PLAYBACK_PLAY`   | `{ videoId: string, positionSeconds: number }`                                    | Start playback             |
| `PLAYBACK_PAUSE`  | `{ positionSeconds: number }`                                                     | Pause playback             |
| `PLAYBACK_SEEK`   | `{ newPositionSeconds: number }`                                                  | Seek to position           |
| `PLAYLIST_ADD`    | `{ videoId: string, title?: string, username: string, newVideoPosition: number }` | Add video to playlist      |
| `PLAYLIST_REMOVE` | `{ videoId: string }`                                                             | Remove video from playlist |
| `CHAT_MESSAGE`    | `{ messageText: string }`                                                         | Send a chat message        |

### Messages received by client

| Message Type        | Payload                  | Description               |
| ------------------- | ------------------------ | ------------------------- |
| `CONNECTED`         | `{ clientId, nodeId }`   | Connection established    |
| `ROOM_CREATED`      | `{ roomCode, state }`    | Room created successfully |
| `ROOM_JOINED`       | `{ roomCode, state }`    | Joined room successfully  |
| `ROOM_LEFT`         | `{ roomCode }`           | Left room successfully    |
| `ROOM_STATE_UPDATE` | `{ roomCode, state }`    | Room state changed        |
| `LEADER_CHANGED`    | `{ roomCode, leaderId }` | Leader node changed       |
| `ERROR`             | `{ message }`            | Error occurred            |

## Raft Consensus

The system uses a simplified Raft-style consensus for:

-   **Leader Election**: Nodes elect a leader per room
-   **Log Replication**: Operations are replicated to followers
-   **Fault Tolerance**: If leader fails, new leader is elected

### Message Types

| Message               | Direction          | Description                 |
| --------------------- | ------------------ | --------------------------- |
| `REQUEST_VOTE`        | Candidate → All    | Request votes for election  |
| `REQUEST_VOTE_RESP`   | Node → Candidate   | Vote granted/denied         |
| `APPEND_ENTRIES`      | Leader → Followers | Heartbeat + log replication |
| `APPEND_ENTRIES_RESP` | Follower → Leader  | Acknowledge entries         |

## Benchmarks

The project includes a comprehensive benchmark suite to measure system performance:

```bash
# Run all benchmarks
bun run src/bench/benchmark.ts

# Run specific tests
bun run src/bench/benchmark.ts --test throughput
bun run src/bench/benchmark.ts --test latency
bun run src/bench/benchmark.ts --test scalability
bun run src/bench/benchmark.ts --test fault
```

### Options

| Option       | Description                                             | Default                |
| ------------ | ------------------------------------------------------- | ---------------------- |
| `--nodes`    | Comma-separated WebSocket URLs                          | Uses CLUSTER_NODES env |
| `--test`     | Test type: all, throughput, latency, scalability, fault | all                    |
| `--duration` | Duration of throughput test in seconds                  | 10                     |
| `--clients`  | Number of concurrent clients for load test              | 10                     |
| `--output`   | Output file for results                                 | benchmark-results.json |

### Metrics Measured

-   **Throughput** - Operations per second the system can handle
-   **Latency** - Response time percentiles (p50, p95, p99) for different operations
-   **Scalability** - Performance with increasing client load
-   **Fault Tolerance** - Recovery time after node failure and leader re-election

Results are saved to `benchmark-results.json` by default.

## License

MIT
