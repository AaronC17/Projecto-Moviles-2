// sockets/connection.js

let socket = null;

export function getSocket() {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        socket = new WebSocket('ws://192.168.100.101:5000');
    }
    return socket;
}

export function esperarSocketAbierto(callback) {
    const sock = getSocket();
    if (sock.readyState === WebSocket.OPEN) {
        callback();
    } else {
        sock.addEventListener('open', callback, { once: true });
    }
}
