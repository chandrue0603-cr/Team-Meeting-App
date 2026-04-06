const APP_ID = 'f9f20fd22534486f844f656b4e57cbef'
const CHANNEL = sessionStorage.getItem('room')
const TOKEN = sessionStorage.getItem('token')
let UID = Number(sessionStorage.getItem('UID'))
let NAME = sessionStorage.getItem('name')

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
let localTracks = []
let remoteUsers = {}
let screenTrack = null
let chatSocket = null

// --- TIMER ---
let meetingStartTime = null
let timerInterval = null

let startTimer = () => {
    meetingStartTime = Date.now()
    timerInterval = setInterval(() => {
        let elapsed = Math.floor((Date.now() - meetingStartTime) / 1000)
        let h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
        let m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
        let s = String(elapsed % 60).padStart(2, '0')
        document.getElementById('meeting-timer').innerText = `${h}:${m}:${s}`
    }, 1000)
}

// --- PARTICIPANTS ---
let participants = {}

let updateParticipantsList = () => {
    let list = document.getElementById('participants-list')
    list.innerHTML = ''
    Object.values(participants).forEach(p => {
        let li = document.createElement('li')
        li.innerText = p
        list.appendChild(li)
    })
    updateVideoGrid()
}

let updateVideoGrid = () => {
    let grid = document.getElementById('video-streams')
    let count = Object.keys(participants).length
    for (let i = 1; i <= 12; i++) grid.classList.remove(`participants-${i}`)
    grid.classList.add(`participants-${Math.min(count, 9)}`)
}

// --- WEBSOCKET CHAT ---
let initChat = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    chatSocket = new WebSocket(`${wsProtocol}://${window.location.host}/ws/chat/${CHANNEL}/`)

    chatSocket.onopen = () => {
        console.log('Chat WebSocket connected')
    }

    chatSocket.onmessage = (e) => {
        let data = JSON.parse(e.data)
        if (data.name !== NAME) {
            appendMessage(data, false)
        }
    }

    chatSocket.onclose = () => {
        console.log('Chat socket closed, reconnecting...')
        setTimeout(initChat, 2000)
    }

    chatSocket.onerror = (err) => {
        console.error('WebSocket error:', err)
    }
}

let sendMessage = () => {
    let input = document.getElementById('chat-input')
    let text = input.value.trim()
    if (!text) return
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected')
        return
    }
    let msg = {
        name: NAME,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    appendMessage(msg, true)
    chatSocket.send(JSON.stringify(msg))
    input.value = ''
}

let appendMessage = (msg, isSelf) => {
    let box = document.getElementById('chat-messages')
    let div = document.createElement('div')
    div.classList.add('chat-message', isSelf ? 'self' : 'other')
    div.innerHTML = `<span class="msg-name">${msg.name}</span>
                     <span class="msg-text">${msg.text}</span>
                     <span class="msg-time">${msg.time}</span>`
    box.appendChild(div)
    box.scrollTop = box.scrollHeight
}

// --- JOIN ---
let joinAndDisplayLocalStream = async () => {
    client.on('user-published', handleUserJoined)
    client.on('user-left', handleUserLeft)

    await client.join(APP_ID, CHANNEL, TOKEN, UID)

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
        { encoderConfig: 'high_quality' },
        { encoderConfig: { width: 1920, height: 1080, frameRate: 30 } }
    )

    await fetch('/create_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: NAME, room_name: CHANNEL, UID: UID })
    })

    participants[UID] = `${NAME} (You)`
    updateParticipantsList()

    let player = `<div class="video-container" id="user-container-${UID}">
                    <div class="user-name">${NAME} (You)</div>
                    <div class="video-player" id="user-${UID}"></div>
                </div>`
    document.getElementById('video-streams').insertAdjacentHTML('beforeend', player)
    localTracks[1].play(`user-${UID}`)
    await client.publish([localTracks[0], localTracks[1]])

    startTimer()
}

// --- REMOTE USERS ---
let handleUserJoined = async (user, mediaType) => {
    remoteUsers[user.uid] = user
    await client.subscribe(user, mediaType)

    if (mediaType === 'video') {
        if (!document.getElementById(`user-container-${user.uid}`)) {
            let player = `<div class="video-container" id="user-container-${user.uid}">
                        <div class="user-name" id="name-${user.uid}">Loading...</div>
                        <div class="video-player" id="user-${user.uid}"></div>
                    </div>`
            document.getElementById('video-streams').insertAdjacentHTML('beforeend', player)
        }
        user.videoTrack.play(`user-${user.uid}`)

        try {
            let response = await fetch(`/get_member/?UID=${user.uid}&room_name=${CHANNEL}`)
            let member = await response.json()
            let nameEl = document.getElementById(`name-${user.uid}`)
            if (nameEl) nameEl.innerText = member.name
            participants[user.uid] = member.name
        } catch(e) {
            let nameEl = document.getElementById(`name-${user.uid}`)
            if (nameEl) nameEl.innerText = `User ${user.uid}`
            participants[user.uid] = `User ${user.uid}`
        }
        updateParticipantsList()
    }

    if (mediaType === 'audio') { user.audioTrack.play() }
}

let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid]
    delete participants[user.uid]
    updateParticipantsList()
    if (document.getElementById(`user-container-${user.uid}`)) {
        document.getElementById(`user-container-${user.uid}`).remove()
    }
}

// --- SCREEN SHARE ---
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

// --- LEAVE ---
let leaveAndRemoveLocalStream = async () => {
    for (let track of localTracks) { track.stop(); track.close() }
    if (screenTrack) { screenTrack.stop(); screenTrack.close() }
    clearInterval(timerInterval)
    if (chatSocket) chatSocket.close()
    await client.leave()
    await fetch('/delete_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: NAME, room_name: CHANNEL, UID: UID })
    })
    window.location.href = '/'
}

// --- PANEL TOGGLE ---
let togglePanel = (panelId) => {
    let panel = document.getElementById(panelId)
    let isOpen = panel.classList.contains('open')
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'))
    if (!isOpen) panel.classList.add('open')
}

// --- DOM READY ---
document.addEventListener('DOMContentLoaded', () => {
    joinAndDisplayLocalStream()
    initChat()

    document.getElementById('leave-btn').addEventListener('click', leaveAndRemoveLocalStream)

    const camWrapper = document.getElementById('camera-btn-wrapper')
    camWrapper.addEventListener('click', async () => {
        await localTracks[1].setMuted(!localTracks[1].muted)
        camWrapper.classList.toggle('muted')
    })

    const micWrapper = document.getElementById('mic-btn-wrapper')
    micWrapper.addEventListener('click', async () => {
        await localTracks[0].setMuted(!localTracks[0].muted)
        micWrapper.classList.toggle('muted')
    })

    document.getElementById('screen-btn-wrapper').addEventListener('click', toggleScreen)

    document.getElementById('info-btn-wrapper').addEventListener('click', () => togglePanel('info-panel'))
    document.getElementById('chat-btn-wrapper').addEventListener('click', () => togglePanel('chat-panel'))
    document.getElementById('close-info-btn').addEventListener('click', () => {
        document.getElementById('info-panel').classList.remove('open')
    })
    document.getElementById('close-chat-btn').addEventListener('click', () => {
        document.getElementById('chat-panel').classList.remove('open')
    })

    document.getElementById('send-btn').addEventListener('click', sendMessage)
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage()
    })
})