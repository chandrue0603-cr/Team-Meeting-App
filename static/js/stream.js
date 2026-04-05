const APP_ID = 'f9f20fd22534486f844f656b4e57cbef'
const CHANNEL = sessionStorage.getItem('room')
const TOKEN = sessionStorage.getItem('token')
let UID = Number(sessionStorage.getItem('UID'))
let NAME = sessionStorage.getItem('name')

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
let localTracks = []
let remoteUsers = {}
let screenTrack = null

let joinAndDisplayLocalStream = async () => {
    client.on('user-published', handleUserJoined)
    client.on('user-left', handleUserLeft)

    await client.join(APP_ID, CHANNEL, TOKEN, UID)

    // 1080p Full HD Configuration
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
        { encoderConfig: 'high_quality' },
        { encoderConfig: { width: 1920, height: 1080, frameRate: 30 } }
    )

    await fetch('/create_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: NAME, room_name: CHANNEL, UID: UID })
    })

    let player = `<div class="video-container" id="user-container-${UID}">
                    <div class="user-name">${NAME} (You)</div>
                    <div class="video-player" id="user-${UID}"></div>
                </div>`
    document.getElementById('video-streams').insertAdjacentHTML('beforeend', player)
    localTracks[1].play(`user-${UID}`)
    await client.publish([localTracks[0], localTracks[1]])
}

let handleUserJoined = async (user, mediaType) => {
    remoteUsers[user.uid] = user
    await client.subscribe(user, mediaType)

    if (mediaType === 'video') {
        let player = `<div class="video-container" id="user-container-${user.uid}">
                    <div class="user-name" id="name-${user.uid}">Loading...</div>
                    <div class="video-player" id="user-${user.uid}"></div>
                </div>`
        document.getElementById('video-streams').insertAdjacentHTML('beforeend', player)
        user.videoTrack.play(`user-${user.uid}`)
        
        let response = await fetch(`/get_member/?UID=${user.uid}&room_name=${CHANNEL}`)
        let member = await response.json()
        document.getElementById(`name-${user.uid}`).innerText = member.name
    }
    if (mediaType === 'audio') { user.audioTrack.play() }
}

let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid]
    if(document.getElementById(`user-container-${user.uid}`)) {
        document.getElementById(`user-container-${user.uid}`).remove()
    }
}

let toggleScreen = async () => {
    let screenBtn = document.getElementById('screen-btn-wrapper')
    if (!screenTrack) {
        screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" })
        await client.unpublish(localTracks[1])
        await client.publish(screenTrack)
        screenTrack.play(`user-${UID}`)
        screenBtn.style.backgroundColor = '#8ab4f8'
    } else {
        await client.unpublish(screenTrack)
        screenTrack.stop(); screenTrack.close(); screenTrack = null
        await client.publish(localTracks[1])
        localTracks[1].play(`user-${UID}`)
        screenBtn.style.backgroundColor = '#3c4043'
    }
}

let leaveAndRemoveLocalStream = async () => {
    for (let track of localTracks) { track.stop(); track.close() }
    if (screenTrack) { screenTrack.stop(); screenTrack.close() }
    await client.leave()
    await fetch('/delete_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: NAME, room_name: CHANNEL, UID: UID })
    })
    window.location.href = '/'
}

document.addEventListener('DOMContentLoaded', () => {
    joinAndDisplayLocalStream()
    document.getElementById('leave-btn').addEventListener('click', leaveAndRemoveLocalStream)
    
    // Cam Toggle
    const camWrapper = document.getElementById('camera-btn-wrapper');
    camWrapper.addEventListener('click', async () => {
        await localTracks[1].setMuted(!localTracks[1].muted);
        camWrapper.classList.toggle('muted');
    });

    // Mic Toggle
    const micWrapper = document.getElementById('mic-btn-wrapper');
    micWrapper.addEventListener('click', async () => {
        await localTracks[0].setMuted(!localTracks[0].muted);
        micWrapper.classList.toggle('muted');
    });

    document.getElementById('screen-btn-wrapper').addEventListener('click', toggleScreen)
})