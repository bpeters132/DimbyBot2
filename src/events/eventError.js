export default async (client) => {
    console.log('Loading onError');
    client.on('error', () => {
        console.error;
    });
};