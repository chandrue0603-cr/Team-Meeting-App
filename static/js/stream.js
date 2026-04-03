console.log('UID:', sessionStorage.getItem('UID'))
console.log('TOKEN:', sessionStorage.getItem('token'))
console.log('ROOM:', sessionStorage.getItem('room'))
console.log('NAME:', sessionStorage.getItem('name'))

const APP_ID = 'f9f20fd22534486f844f656b4e57cbef'

// ✅ URL + session fallback
const urlParams = new URLSearchParams(window.location.search)

const CHANNEL = sessionStorage.getItem('room') || urlParams.get('room')
const TOKEN   = sessionStorage.getItem('token') || urlParams.get('token')
let UID       = Number(sessionStorage.getItem('UID') || urlParams.get('uid'))
let NAME      = sessionStorage.getItem('name') || urlParams.get('name')

// ✅ Safety check
if (!CHANNEL || !TOKEN || !UID) {
    console.log("Missing data → redirecting")
    window.open('/', '_self')
}

const client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'})

let localTracks = []
let remoteUsers = {}

let joinAndDisplayLocalStream = async () => {
    document.getElementById('room-name').innerText = CHANNEL

    client.on('user-published', handleUserJoined)
    client.on('user-left', handleUserLeft)

    try {
        await client.join(APP_ID, CHANNEL, TOKEN, UID)
    } catch(error) {
        console.error("Join Error:", error)
        window.open('/', '_self')
    }

    try {
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks()
    console.log("Tracks created:", localTracks)
    } catch (err) {
        alert("Camera & Mic permission allow pannunga!")
        console.error("Track error:", err)
        return
    }

    let member = await createMember()

    let player = `<div class="video-container" id="user-container-${UID}">
                    <div class="username-wrapper">
                        <span class="user-name">${member.name}</span>
                    </div>
                    <div class="video-player" id="user-${UID}"></div>
                </div>`
    
    document.getElementById('video-streams').insertAdjacentHTML('beforeend', player)

    // ✅ Play local video
    localTracks[1].play(`user-${UID}`, { fit: "cover" })

    console.log("Publishing tracks...", localTracks)

    try {
        await client.publish([localTracks[0], localTracks[1]])
        console.log("Publish success")
    } catch (e) {
        console.error("Publish failed:", e)
    }
}

let handleUserJoined = async (user, mediaType) => {
    remoteUsers[user.uid] = user
    
    try {
        await client.subscribe(user, mediaType)
    } catch (e) {
        console.warn("Subscribe issue:", e)
    }

    let player = document.getElementById(`user-container-${user.uid}`)
    
    if (player === null) {
        let playerHtml = `<div class="video-container" id="user-container-${user.uid}">
                            <div class="username-wrapper">
                                <span class="user-name" id="name-${user.uid}">Loading...</span>
                            </div>
                            <div class="video-player" id="user-${user.uid}"></div>
                            </div>`
        document.getElementById('video-streams').insertAdjacentHTML('beforeend', playerHtml)

        getMember(user).then(member => {
            document.getElementById(`name-${user.uid}`).innerText = member.name
        }).catch(() => {
            document.getElementById(`name-${user.uid}`).innerText = "User"
        })
    }

    if (mediaType === 'video') {
        user.videoTrack.play(`user-${user.uid}`)
    }

    if (mediaType === 'audio') {
        user.audioTrack.play()
    }
}

let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid]
    let item = document.getElementById(`user-container-${user.uid}`)
    if (item) {
        item.remove()
    }
}

let leaveAndRemoveLocalStream = async () => {
    for (let i = 0; localTracks.length > i; i++) {
        localTracks[i].stop()
        localTracks[i].close()
    }

    await client.leave()
    deleteMember()
    window.open('/', '_self')
}

let toggleCamera = async (e) => {
    if (localTracks[1].muted) {
        await localTracks[1].setMuted(false)
        e.currentTarget.style.backgroundColor = '#fff'
    } else {
        await localTracks[1].setMuted(true)
        e.currentTarget.style.backgroundColor = 'rgb(255,80,80)'
    }
}

let toggleMic = async (e) => {
    if (localTracks[0].muted) {
        await localTracks[0].setMuted(false)
        e.currentTarget.style.backgroundColor = '#fff'
    } else {
        await localTracks[0].setMuted(true)
        e.currentTarget.style.backgroundColor = 'rgb(255,80,80)'
    }
}

// ✅ Backend APIs
let createMember = async () => {
    let response = await fetch(window.location.origin + '/create_member/', {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({'name':NAME, 'room_name':CHANNEL, 'UID':UID})
    })
    return await response.json()
}

let getMember = async (user) => {
    let response = await fetch(window.location.origin + `/get_member/?UID=${user.uid}&room_name=${CHANNEL}`)
    return await response.json()
}

let deleteMember = async () => {
    await fetch(window.location.origin + '/delete_member/', {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({'name':NAME, 'room_name':CHANNEL, 'UID':UID})
    })
}

// ✅ MOBILE FIX (user interaction required)
document.addEventListener('DOMContentLoaded', () => {

    let btn = document.createElement('button')
    btn.innerText = "Start Video"

    btn.style.position = "absolute"
    btn.style.top = "50%"
    btn.style.left = "50%"
    btn.style.transform = "translate(-50%, -50%)"
    btn.style.padding = "12px 20px"
    btn.style.fontSize = "18px"
    btn.style.zIndex = "1000"
    btn.style.backgroundColor = "#4CAF50"
    btn.style.color = "white"
    btn.style.border = "none"
    btn.style.borderRadius = "5px"

    document.body.appendChild(btn)

    btn.addEventListener('click', () => {
        btn.remove()
        joinAndDisplayLocalStream()
    })
})

window.addEventListener('beforeunload', deleteMember)

document.getElementById('leave-btn').addEventListener('click', leaveAndRemoveLocalStream)
document.getElementById('camera-btn').addEventListener('click', toggleCamera)
document.getElementById('mic-btn').addEventListener('click', toggleMic)