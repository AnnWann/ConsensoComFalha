import crypto from 'crypto'
import Swarm from'discovery-swarm'
import defaults from'dat-swarm-defaults'
import getPort from 'get-port'
import * as readline from 'readline'

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

let receivedMessages = []
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


const initialize = () => {
  return {
    valuesCurrent: [crypto.randomInt(50)],
    valuesPrevious: [],
    r: 1
  }
}


const decide = () => {
  if(!consensusState){
    log("no State was produced")
    return
  }

  if(!consensusState.valuesCurrent){
    log("No values retrieved")
    return
  }

  return Math.min(...consensusState.valuesCurrent)
}

const runConsensus = async (F) => {

  log("\nConsensus is deciding")

  log("\nI have picked: " + consensusState.valuesCurrent[0])

  while(consensusState.r <= F + 1) {
    
    const new_values = consensusState.valuesCurrent.filter(x => !consensusState.valuesPrevious.includes(x))
    log('\nRound '+ consensusState.r+ ', I\'m sending: '+ new_values)

    for(let id in peers)
      peers[id].conn.write(JSON.stringify(new_values))
    

    await sleep(200)

    const valuesNext = consensusState.valuesCurrent
    valuesNext.push(...receivedMessages)

    log('\nI got back: ' + receivedMessages + '\nSo I have: ' + valuesNext)

    //Simulate failure
    const willIDie = crypto.randomInt(100)
  
    if(willIDie > 94) {
      log('oh nyoooo, I\'m dyinggggggggggg\n')
      process.exit()
    }

    consensusState.valuesPrevious = consensusState.valuesCurrent
    consensusState.valuesCurrent = valuesNext
    consensusState.r++
    receivedMessages = []
  }

  const decision = decide()
  if(!decision){
    log("\nno decision produced, retrying...")
    flushState()
    return
  }

  log('\nAfter round '+ (consensusState.r - 1) + ', We have decided that the answer is: '+ decision + '\n')
  log('-----------------------------------\n')
  flushState()
  
  askUser()
}
const flushState = () => {
  consensusState.valuesCurrent = [crypto.randomInt(50)]
  consensusState.valuesPrevious = []
  consensusState.r = 1
}

const askUser = () => {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('Press any key to start', async _ => {
    for(let id in peers){
      peers[id].conn.write('go')
    }
    await sleep(10)
    runConsensus(2)
  });
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
    //log(`Connected #${seq} to peer: ${peerId}`)

    // Keep alive TCP connection with peer
    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600)
      } catch (exception) {
        log('exception', exception)
      }
    }


    conn.on('data', async data => {
      // Here we handle incoming messages

      if(data.toString() === 'go'){
        await sleep(10)
        runConsensus(2)
      }else{
        const parsedData = JSON.parse(data.toString())

        receivedMessages.push(...parsedData)
      }

      

    })

    conn.on('close', () => {
      // Here we handle peer disconnection
      //log(`Connection ${seq} closed, peer id: ${peerId}`)
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
  askUser()
})()

const consensusState = initialize()

/* async function main() {
  while(1){
    await runConsensus(2)
    const decision = decide()
    if(!decision){
      log("no decision produced, retrying...")
      flushState()
      continue
    }
  
    log(`We decided that the answer is: ${decision}`)
    flushState()
    
    await sleep(1000)
  }
} */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//main()




