const EventEmitter = require('events');

class RealtimeService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  addClient(res) {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  notifyComplaintUpdate(data = {}) {
    const payload = JSON.stringify({
      type: 'complaint_updated',
      timestamp: Date.now(),
      ...data
    });

    for (const client of this.clients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {
        this.clients.delete(client);
      }
    }

    this.emit('complaint_updated', data);
  }
}

module.exports = new RealtimeService();
