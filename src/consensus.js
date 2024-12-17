
// isSeenByAll 
// F

function initializeConsensus() {
    return [];
}
function decide(values) {
    return Math.min(...values);
}

function sendToAll(values, processes, F) {
    for (let k = 1; k < F+1; k++) {
        for (let i = 0; i < processes.length; i++) {
            processes[i].send(values);
        }
        
    }
}

