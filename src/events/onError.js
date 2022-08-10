export default async (client) => {
    console.log('Loading event on error');
    client.on('error', (err) => {
        console.error(err);
    });
};