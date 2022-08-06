export default async (client) => {
    console.log('Loading event on ready');
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
        client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
        setInterval(() => {
            client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
        }, 21600 * 1000);
    });
};