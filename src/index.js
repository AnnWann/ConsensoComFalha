import crypto from 'crypto'
import Swarm from'discovery-swarm'
import defaults from'dat-swarm-defaults'
import getPort from 'get-port'
import readline from'readline'

/**
 * Here we will save our TCP peer connections
 * using the peer id as key: { peer_id: TCP_Connection }
 */
const peers = {}
// Counter for connections, used for identify connections
let connSeq = 0

// Peer Identity, a random hash for identify your peer
const myId = crypto.randomBytes(32)
console.log('Your identity: ' + myId.toString('hex'))

// reference to redline interface
let rl

// times of failure
const F = 1

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
  askUser()
}

/*
* Function to get text input from user and send it to other peers
* Like a chat :)
*/

const askUser = async () => {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('Send message: ', async message => {
    const messageId = crypto.randomBytes(32).toString('hex')
    const values = [];
    //Run through n times more than the failures
    for (let k = 1; k <= F+1; k++) {
      // Broadcast to peers
      for (let id in peers) {
        const userMessage = JSON.stringify({ type: 'user', message, id: messageId })
        peers[id].conn.write(userMessage)
      }
      // wait a given time because its supposed to be sync
      await new Promise(resolve => setTimeout(resolve, 100))
      
      //get all replies
      for (let id in peers) {
        if (peers[id].replies) {
          //push replies into values
          values.push(... peers[id].replies)
        }
      }
    }

    //decide based on the minimum value
    const decide = Math.min(... values)

    if(decide) log('the message has been seen by all peers')
    else log('the message hasn\'t been seen by all peers')
    rl.close()
    rl = undefined
    askUser()
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
    log(`Connected #${seq} to peer: ${peerId}`)

    // Keep alive TCP connection with peer
    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600)
      } catch (exception) {
        log('exception', exception)
      }
    }

    const processedMessages = new Set()

    conn.on('data', data => {
      // Here we handle incomming messages

      const parsedData = JSON.parse(data.toString())

      if (parsedData.type === 'user') {
        if(!processedMessages.has(parsedData.id)) {
          log(`Received Message from peer ${peerId}: \n----->${parsedData.message}`)
          processedMessages.add(parsedData.id)
          const replyMessage = JSON.stringify({ type: 'reply', message: 1, id: parsedData.id })
          conn.write(replyMessage)
        }
      } else if (parsedData.type === 'reply') {
        if(!processedMessages.has(parsedData.id)) {
          const replyMessage = JSON.stringify({ type: 'reply', message: 0, id: parsedData.id })
          conn.write(replyMessage)
        }
        if (!peers[peerId].replies) {
          peers[peerId].replies = []
        }
        peers[peerId].replies.push(parsedData.message)
      }

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
  askUser()  

})()