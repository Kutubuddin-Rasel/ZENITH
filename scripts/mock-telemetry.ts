async function sendHeartbeat(ticketId: string) {
    try {
        const response = await fetch('http://localhost:3000/telemetry/beat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'test-api-key' // Ensure a valid key exists
            },
            body: JSON.stringify({
                ticketId,
                projectId: 'project-123', // Replace with valid ID
                userId: 'user-456', // Replace with valid ID
                branch: 'feat/test-ticket',
                timestamp: Date.now(),
            })
        });

        if (response.ok) {
            console.log(`Sent heartbeat for ${ticketId}: Success`);
        } else {
            console.error(`Failed to send heartbeat: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error sending heartbeat:', error);
    }
}

// Send a burst of heartbeats
(async () => {
    console.log('Starting Telemetry Mock...');
    await sendHeartbeat('ZEN-101');
    // In a real test, we would wait 10 mins, but for verification we just check log reception
})();
