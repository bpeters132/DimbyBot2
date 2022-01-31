const shuffle = (queue) => {
    return new Promise((resolve) =>{
        if (!queue.tracks.length || queue.tracks.length < 3) return false;
        // const currentTrack = queue.tracks.shift();
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        // queue.tracks.unshift(currentTrack);
        resolve(true);
    });
   
};

module.exports.shuffle = shuffle;