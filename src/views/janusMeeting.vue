<template>
  <div class="iptContainer">
    <var-input placeholder="请输入房间号" v-model="roomId" type="number" />
    <var-input placeholder="请输入比特率" v-model="bitrate" type="number" />
    <var-input placeholder="请输入房间最大容纳人数" v-model="roomUserCount" type="number" />
    <var-input placeholder="请输入房间名称" v-model="desc"/>
    <var-input placeholder="请输入房间密码" v-model="pin" type="number" />
    <var-input placeholder="请输入昵称" v-model="nickName" />

  </div>
  <div class="createBtn">
    <var-button type="primary" @click="createRoom">创建房间</var-button>
    <var-button type="primary" @click="joinRoom">加入房间</var-button>
    <var-button type="primary" @click="sendGetRoomRequest">获取人员列表</var-button>
  </div>

  <div>
    <div>
      <div>本地：</div>
      <video id="localdomIdRef" width="500"></video>
    </div>
    <div>
      <div>其他</div>
      <div v-for="(item) in publisherList" :key="item.id">
        <div>{{ item.display }}</div>
        <video :id="item.id + 'Ref'" style="object-fit: fill;width: 500px;"></video>
        <button @click="outPersonRequest(item.id)">踢</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import adapter from 'webrtc-adapter';
import Janus from "../utils/js/Janus";
import { $msg } from '../utils/js/message.js'

let roomId = ref("")
let bitrate = ref("")
let roomUserCount = ref("")
let desc = ref("")
let pin = ref("")
let nickName = ref("")
let private_id = ref("") // Janus分配给用户的ID


let log = console.log
let janus = null
let opaqueId = "videocall-" + Janus.randomString(12);
let videoStatus = true

function initJanus() {
  Janus.init({
    debug: true,
    dependencies: Janus.useDefaultDependencies({
      adapter: adapter
    }),
    callback: () => {
      if (!Janus.isWebrtcSupported()) {
        Janus.log('is not supported webrtc!')
        return
      }
    }
  })

  log(opaqueId, 'opaqueId')
  janus = new Janus({
    server: 'http://127.0.0.1:18088/janus',
    apisecret: 'biasecret',
    success: function () {
      Janus.log("初始化成功")
      initVideoCallPlugin()
    },
    error: function (cause) {
      // Error, can't go on...
      Janus.log(cause)
    },
    destroyed: function () {
      // I should get rid of this
      Janus.log("destroyed")
    }
  })
}
let videoRoomPluginHandle = null
function initVideoCallPlugin() {
  janus.attach({
    opaqueId: opaqueId,
    plugin: "janus.plugin.videoroom",
    success: function (pluginHandle) {
      //插件初始化成功后 pluginHandle 就是全局句柄，通过 pluginHandle可以操作当前
      //会话的所有功能
      videoRoomPluginHandle = pluginHandle
      console.log("会议插件初始化成功")
    },
    error: function (cause) {
      //插件初始化失败
      log('初始化失败')
    },
    webrtcState: function(on) {
      log(`webRTC PeerConnection state is ${on ? "up": "down"} now`)
    },
    slowLink: function(uplink, lost, mid) {
      log(`Janus 问题报告： ${ uplink ? "sending" : "receiving" } packets on mid ${ mid } ( ${lost} lost packets)`)
    },
    onmessage: function (msg, jsep) {
      //msg 交互信息包括挂断 接听等事件监听
      // jsep  协商信令
      log('onmessage')
      onMessageForVideoMeeting(msg, jsep)

    },
    onlocaltrack: function (track, added) {
      // 本地媒体流发布后可以监听
      console.log("本地媒体", track, added)
      if (added === true) {
        setDomVideoTrick("localdomIdRef", track)
      }

    },
    onremotetrack: function (track, mid, added) {
      // 远端媒体流
      console.log("远程媒体", track, mid, added)
    },
    oncleanup: function () {
      log('cleanup')
      // PeerConnection 关闭监听
      // 同时可以创建信的句柄(旧的可用)重新初始化
    },
    detached: function () {
      log('detached')
      // PeerConnection 关闭监听
      // 同时可以创建信的句柄（旧的不可用）重新初始化
    }
  });
}

function setDomVideoTrick(domId, track) {
  let video = document.getElementById(domId)
  let stream = video.srcObject
  if (stream) {
    stream.addTrack(track)
  } else {
    stream = new MediaStream()
    stream.addTrack(track)
    video.srcObject = stream
    video.controls = false;
    video.autoplay = true;
  }
}

let publisherList = ref([])
function onMessageForVideoMeeting(msg, jsep) {
  log(":::get a message:::")
  const event = msg["videoroom"]
  log(msg)
  if(jsep) {
    // 设置远程应答描述
    videoRoomPluginHandle.handleRemoteJsep({jsep})
  }
  log(msg)
  switch(event) {
    case "joined": 
      private_id.value = msg["private_id"]
      publisherStream()

      // 新加入房间，获取媒体发布者
      if(msg["publishers"]) {
        const list = msg["publishers"]
        for(let u of list) {
          let publisher = u
          localPubDomPush(publisher["id"], publisher["display"])
          subscriberMedia(publisher)
        }
      }
      break;
    case 'event': 
      if(msg["unpublished"]) {
        log(`用户${msg["unpublished"]}停止发布流！`)
      }else if(msg["leaving"]) {
        if(msg["reason"] && msg["reason"] === "kicked") {
          $msg("warning", "您已被踢出房间！")
        }else{
          log(`用户${msg["leaving"]}主动离开房间${msg["room"]}`)
        }
      }else if(msg["moderation"] && msg["moderation"] === "muted") {
        $msg("warning", `用户${msg["id"]}已被禁言`)
      }else if(msg["publishers"]) {
         // 已在房间的用户监听到有人新发媒体流
         const list = msg["publishers"]
        for(let u of list) {
          let publisher = u
          localPubDomPush(publisher["id"], publisher["display"])
          subscriberMedia(publisher)
        }
      }else if(msg["error_code"]) {
        log(msg)
      }
    break;
    default:
      break;
  }
}

function localPubDomPush(id, display) {
  let index = publisherList.value.findIndex(v => v.id === id)
  if(index === -1) {
    publisherList.value.push({
      id, display
    })
  }
}

function subscriberMedia(user) {
  let publisherPlugin = null
  janus.attach({
    plugin: "janus.plugin.videoroom",
    success: function(pluginHandle) {
      publisherPlugin = pluginHandle
      var subscribe = {
        request: "join",
        room: Number(roomId.value),
        ptype: "subscriber", // 订阅者
        feed: user["id"], // 被订阅用户ID
        private_id: private_id.value
      }
      publisherPlugin.send({
        message: subscribe
      })
    },
    error: function(err) {
      log('插件加载异常', err)
    },
    consentDialog: function(on) {

    },
    onmessage: function(msg, jsep) {
      log('订阅媒体发布者的消息', msg)
      const event = msg["videoroom"]
      if(jsep) {
        publisherPlugin.createAnswer({
          jsep,
          tracks: [{type: "data"}],
          success: function(ansjsep) {
            Janus.debug("got sdp", ansjsep)
            var body = {
              request: "start",
              room: Number(roomId.value)
            }
            publisherPlugin.send({
              message: body,
              jsep: ansjsep
            })
          },
          error: function(err) {
            Janus.error("webRTC error", err)
          }
        })
      }

      switch(event) {
        case "attached":
          log(`订阅用户${user["display"]}信息成功`)
          break;
        default:
          break;
      }
    },
    onlocaltrack: function(track, added) {
      log("publisher onlocaltrack", track, added)
    },
    onremotetrack: function(track, mid, added) {
      let obj = {
        track,
        mid,
        added,
        userId: user["id"],
        display: user["display"],
        trackKind: track["kind"] // 类型video/audio
      }

      log('订阅媒体流变更', obj)
      if(added) {
        setDomVideoTrick(user["id"] + "Ref", track)
      }
    }
  })
}


function controlVideo(){
    videoStatus = !videoStatus
    videoRoomPluginHandle.send({ message:
      { request: "set", video: videoStatus},
    });
  }


onMounted(() => {
  initJanus()
})

function createRoom() {
  if(roomId.value == "") {
    return $msg("warning", "请输入房间号")
  }
  if(desc.value == "") {
    return $msg("warning", "请输入房间名称")
  }
  createJanusRoom(roomId.value, roomUserCount.value, bitrate.value, pin.value, desc.value)
}

function createJanusRoom(roomId, roomUserCount, bitrate, pin, desc) {
  let create = {
    request: "create",
    room: parseInt(roomId), // 房间号只能为数字类型
    bitrate: bitrate ? parseInt(bitrate) * 1000 : 300 * 1000, // 比特率
    publishers: roomUserCount ? parseInt(roomUserCount) : 12, // 房间人数
    description: desc, // 房间描述，房间名称
    record: false, // 是否录制这个房间，默认false
    rec_dir: "/home/janus-gateway/record/", // 存储文件路径
    permanent: false, // 是否持久化，如果为true，则服务重启后房间还是存在，并不会因为服务重启房间丢失
    audiolevel_event: false, // 向其他用户发送事件
    audio_active_packets: 50 // 音频级别的数据包数量，越小对声音越敏感
  }

  if(pin) {
    create.pin = pin // 加入房间所需的密码
    create.secret = pin // 编辑，销毁房间所需的密码
  }

  videoRoomPluginHandle.send({
    message: create,
    success: function(result) {
      Janus.log("房间创建成功", result)
    }
  })
}

// 获取房间人员列表
function sendGetRoomRequest() {
  videoRoomPluginHandle.send({
    message:  {
      request: "listparticipants",
      room: Number(roomId.value)
    },  
    success: function(result) {
      log(result)
    }    
  })
}

// 踢出房间
function outPersonRequest(id) {
  videoRoomPluginHandle.send({
    message: {
      request: "kick",
      room: Number(roomId.value),
      id: id
    },
    success: function(result) {
      log(result)
    }
  })
}

let userId = new Date().getTime()
// 加入房间
function joinRoom() {
  const join = {
    request: 'join',
    room: parseInt(roomId.value),
    id: userId,
    ptype: "publisher", // 发布者
    display: nickName.value // 展示的昵称
  }

  if(pin.value) {
    join.pin = pin.value
  }

  videoRoomPluginHandle.send({
    message: join,
    success: function(result) {
      log(`${nickName.value}正在加入${roomId.value}会议室`)
    },
    error: function(err) {
      log("加入过程出错", err)
    }
  })
}

// 发布流
function publisherStream() {
  videoRoomPluginHandle.createOffer({
    tracks: [
      { type: 'screen', capture: true, recv: false },
      { type: 'data' }
    ],
    success: function(jsep) {
      log("发布者SDP", jsep)
      let publish = {
        request: "configure",
        audio: true,
        video: true, 
        restart: true
      }
      videoRoomPluginHandle.send({
        message: publish,
        jsep
      })
    },
    error: function(err) {
      log('webRTC error', err)
    }
  })
}


</script>

<style lang="less" scoped>
.iptContainer {
  width: 300px;
  overflow: hidden;
}

.createBtn {
  margin-top: 10px;
}

</style>
