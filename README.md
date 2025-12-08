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

## Prerequisites

-   [Bun](https://bun.sh/) runtime (v1.0+)
-   [Node.js](https://nodejs.org/) (for frontend)

## Installation

```bash
# Install backend dependencies
bun install

# Install frontend dependencies
cd frontend && npm install
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

### Development (backend + frontend)

```bash
bun run dev
```

This starts all backend nodes and the frontend dev server concurrently.

### Start backend nodes only

```bash
bun run start-all
```

### Start nodes individually

Each node needs its own `NODE_ID` environment variable:

```bash
# In separate terminals:
NODE_ID=node-a bun run src/index.ts
NODE_ID=node-b bun run src/index.ts
NODE_ID=node-c bun run src/index.ts
```

Or use the npm scripts (these use command line args instead):

```bash
bun run node-a
bun run node-b
bun run node-c
```

### Start frontend only

```bash
bun run frontend:dev
```

### Run the test client

```bash
bun run test-client
```

The test client will:

1. Connect to Node A
2. Set a user ID
3. Create a new room
4. Add a video to playlist
5. Start playback
6. Send a chat message
7. Seek and pause

## Project Structure

```
src/
├── index.ts              # Main entry point
├── test-client.ts        # Test client for verification
├── types/                # TypeScript type definitions
│   ├── index.ts
│   ├── messages.ts       # Message types (Room & Raft)
│   ├── room.ts           # Room state types
│   └── node.ts           # Node configuration types
├── consensus/            # Raft consensus implementation
│   ├── index.ts
│   └── raft.ts           # Simplified Raft algorithm
├── room/                 # Room state management
│   ├── index.ts
│   └── room-state.ts     # Room state manager
├── rpc/                  # Inter-node communication
│   ├── index.ts
│   └── rpc.ts            # RPC client & server
├── node/                 # Backend node implementation
│   ├── index.ts
│   └── backend-node.ts   # Main backend node
└── config/               # Configuration
    ├── index.ts
    └── cluster.ts        # Cluster configuration
```

## Client WebSocket API

### Messages sent by client

| Message Type      | Payload                                         | Description                |
| ----------------- | ----------------------------------------------- | -------------------------- |
| `SET_USER_ID`     | `{ userId: string }`                            | Set the user ID            |
| `CREATE_ROOM`     | `{}`                                            | Create a new room          |
| `JOIN_ROOM`       | `{ roomCode: string }`                          | Join an existing room      |
| `LEAVE_ROOM`      | `{ roomCode: string }`                          | Leave the current room     |
| `PLAYBACK_PLAY`   | `{ videoId: string, positionSeconds: number }`  | Start playback             |
| `PLAYBACK_PAUSE`  | `{ positionSeconds: number }`                   | Pause playback             |
| `PLAYBACK_SEEK`   | `{ newPositionSeconds: number }`                | Seek to position           |
| `PLAYLIST_ADD`    | `{ videoId: string, newVideoPosition: number }` | Add video to playlist      |
| `PLAYLIST_REMOVE` | `{ videoId: string }`                           | Remove video from playlist |
| `CHAT_MESSAGE`    | `{ messageText: string }`                       | Send a chat message        |

### Messages received by client

| Message Type        | Payload                  | Description               |
| ------------------- | ------------------------ | ------------------------- |
| `CONNECTED`         | `{ clientId, nodeId }`   | Connection established    |
| `USER_ID_SET`       | `{ userId }`             | User ID confirmed         |
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

## License

MIT
