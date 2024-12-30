import crypto from 'crypto'
import Swarm from'discovery-swarm'
import defaults from'dat-swarm-defaults'
import getPort from 'get-port'
import readline from'readline'
import { stringify } from 'querystring'

/**
 * Here we will save our TCP peer connections
 * using the peer id as key: { peer_id: TCP_Connection }
 */


/*-------------------------

struct data = {
  int ans;
  char* peer
}

struct consensusState = {
  data[] valuesi 
  data[] valuesi_1
  int r
}
data[] values 

initialize() -> consensusState | valuesi == [rand()] and valuesi_1 == []

runConsensus(consensusState, F)

decide(consensusState) -> int
*/

const peers = {}
// Counter for connections, used for identify connections
let connSeq = 0

// Peer Identity, a random hash for identify your peer
const myId = crypto.randomBytes(32)
console.log('Your identity: ' + myId.toString('hex'))

// reference to redline interface
let rl

const receivedMessages = new Set()
/**
 * Function for safely call console.log with readline interface active
 */
function log () {
  if (rl) {
    rl.clearLine()    
    rl.close()
    rl = undefined
  }
  for (let i = 0, len = arguments.length; i < len; i++) {
    console.log(arguments[i])
  }
}

const subtractMap = (map1, map2) => {
  const keys1 = Array.from(map1.keys())
  const keys2 = Array.from(map2.keys())
  keys1.forEach((key) => {
    keys2.forEach((key2) => {
      if(key === key2){
        map1.delete(key)
        return
      }
    })
  })
}

const initialize = (ip) => {
  const map = new Map()

  map.set(ip, crypto.randomInt(50))

  return {
    valuesCurrent: map,
    valuesPrevious: new Map(),
    r: 1
  }
}

const decide = (consensusState) => {
  if(!consensusState){
    log("no State was produced")
    return
  }

  if(!consensusState.valuesCurrent){
    log("No values retrieved")
    return
  }

  const values = Array.from(consensusState.valuesCurrent.values())
  return Math.min(values)
}
  
const runConsensus = (F) => {
  
  log("Consensus is deciding")
  const state = initialize(myId)

  while(state.r <= F) {
    for(let id in peers){
      peers[id].conn.write(JSON.stringify(stringify(subtractMap(state.valuesCurrent, state.valuesPrevious))))
    }
    
    const valuesNext = state.valuesCurrent

    //ValuesNext U setV

    setTimeout(() => {}, 10)

    const receivedMessagesArray = Array.from(receivedMessages.entries())
    receivedMessagesArray.forEach(([key, value]) => {
      valuesNext.set(key, value)
    })

    state.valuesPrevious = state.valuesCurrent
    state.valuesCurrent = valuesNext
    state.r++
    
  }

  const decision = decide(state)

  if(!decision){
    log("no decision produced, retrying...")
    runConsensus(F)
    return 
  }

  log(`We decided that the answer is: ${decision}`)
}

/** 
 * Default DNS and DHT servers
 * This servers are used for peer discovery and establishing connection
 */
const config = defaults({
  // peer-id
  id: myId,
})

/**
 * discovery-swarm library establishes a TCP p2p connection and uses
 * discovery-channel library for peer discovery
 */
const sw = Swarm(config)


;(async () => {

  // Choose a random unused port for listening TCP peer connections
  const port = await getPort()

  sw.listen(port)
  console.log('Listening to port: ' + port)

  /**
   * The channel we are connecting to.
   * Peers should discover other peers in this channel
   */
  sw.join('our-fun-channel')

  sw.on('connection', (conn, info) => {
    // Connection id
    const seq = connSeq

    const peerId = info.id.toString('hex')
    log(`Connected #${seq} to peer: ${peerId}`)

    // Keep alive TCP connection with peer
    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600)
      } catch (exception) {
        log('exception', exception)
      }
    }

    conn.on('data', data => {
      // Here we handle incomming messages

      const parsedData = JSON.parse(data.toString())

      receivedMessages.add(parsedData)

    })

    conn.on('close', () => {
      // Here we handle peer disconnection
      log(`Connection ${seq} closed, peer id: ${peerId}`)
      // If the closing connection is the last connection with the peer, removes the peer
      if (peers[peerId].seq === seq) {
        delete peers[peerId]
      }
    })

    // Save the connection
    if (!peers[peerId]) {
      peers[peerId] = {}
    }
    peers[peerId].conn = conn
    peers[peerId].seq = seq
    connSeq++
    
  })

  // Read user message from command line
  if(Object.keys(peers).length > 2) runConsensus(1)
})()
