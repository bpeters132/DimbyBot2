export default async (client) => {
    console.log('Loading event on ready');
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
        client.user.setActivity('Serving the People');
        setInterval(() => {
            client.user.setActivity('Serving the People');
        }, 21600 * 1000);
    });
};