import {CSPlayerPawn, Instance,CSPlayerController, Entity} from "cs_script/point_script";
import {PvEGameManager} from "../class/game_manager";
import { NavMesh } from "../class/monster/navmesh/path_manager";
Instance.ServerCommand("mp_warmup_offline_enabled 1");
Instance.ServerCommand("mp_warmup_pausetimer 1");
Instance.ServerCommand("mp_roundtime 60");
Instance.ServerCommand("mp_freezetime 1");
Instance.ServerCommand("mp_ignore_round_win_conditions 1");
Instance.ServerCommand("weapon_accuracy_nospread 1");

//let position={x: 0,y: 0,z: 0};
//let eye={pitch: 0,yaw: 0,roll: 0};
//let pd=false;
//Instance.SetThink(() => {
//    var players=Instance.FindEntitiesByClass("player");
//    players.forEach((e)=>{
//        if(e&&e instanceof CSPlayerPawn)
//        {
//            var p=e.GetPlayerController()?.GetPlayerPawn();
//            if(pd==false)return;
//            if(p)
//            {
//                const ang=p.GetAbsAngles();
//                const pos=p.GetAbsVelocity();
//                const poss=p.GetAbsOrigin();
//                const eyed=p.GetEyePosition().z-poss.z;
//                const { forward, right } = yawToVectors(p.GetEyeAngles().yaw);
//
//                const forwardSpeed = dot(pos, forward);
//                const sideSpeed    = dot(pos, right);
//                const input = {
//                    W: false,
//                    A: false,
//                    S: false,
//                    D: false,
//                };
//                if(Math.abs(forwardSpeed)>Math.abs(sideSpeed))
//                {
//                    if (forwardSpeed >  1) input.W = true;
//                    if (forwardSpeed < -1) input.S = true;
//                }
//                else
//                {
//                    if (sideSpeed <  -1) input.D = true;
//                    if (sideSpeed > 1) input.A = true;
//                }
//                Instance.DebugScreenText({text:`按下按键：${input.W?"W":" "} ${input.S?"S":" "} ${input.A?"A":" "} ${input.D?"D":" "} ${pos.z>10?"JUMP":" "} ${eyed<=46?"CTRL":" "}`,x:250,y:170,duration:1/64});
//                Instance.DebugScreenText({text:`是否进入商店:${pd?"true":"false"}`,x:250,y:230,duration:1});
//                //p.Teleport({velocity:{x:0.5,y:0.5,z:pos.z}});
//                p.Teleport({position:{x:position.x,y:position.y,z:poss.z},angles:{pitch:ang.pitch,roll:ang.roll,yaw:eye.yaw}});
//                return;
//            }
//        }
//    })
//    Instance.SetNextThink(Instance.GetGameTime()+1/64);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/64);
//Instance.OnPlayerChat((event) => {
//    const text = (event.text || "").trim().toLowerCase().split(' ')[0];
//    const num=Number((event.text || "").trim().toUpperCase().split(' ')[1]);
//    if (text === "shop" || text === "!shop")
//    {
//        if(event.player)
//        {
//            const eee=event.player.GetAbsAngles();
//            eye.pitch=eee.pitch;
//            eye.roll=eee.roll;
//            eye.yaw=eee.yaw;
//            const ooo=event.player.GetAbsOrigin();
//            position.x=ooo.x;
//            position.y=ooo.y;
//            position.z=ooo.z;
//        }
//        pd=!pd;
//    }
//});
let m_PvEGameManager=new PvEGameManager();
Instance.OnScriptReload({
    before: () => {
        // 保存需要持久化的数据
    },
    after: () => {
        // 重新初始化，恢复数据
        m_PvEGameManager = new PvEGameManager();
        m_PvEGameManager.init();
    }
});
Instance.OnScriptInput("restart",()=>{
    m_PvEGameManager.resetGame();
})
//Instance.SetThink(() => {
//    const tr=Instance.TraceSphere({radius:30,start:{x:100,y:100,z:100},end:{x:100,y:100,z:100},ignorePlayers:true});
//    if(tr&&tr.didHit)Instance.DebugSphere({radius:30,center:tr.end,duration:1});
//    
//    Instance.SetNextThink(Instance.GetGameTime()+1/1);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/1);
//导航网格调试debug
//let pathfinder = new NavMesh();
//let path_ini=false;
//function init()
//{
//    if(path_ini)return;
//    let start = new Date();
//    Instance.Msg("导航初始化中");
//    pathfinder.init();
//    let end = new Date();
//    Instance.Msg(`导航初始化完成,耗时${end.getTime()-start.getTime()}ms`);
//    path_ini=true;
//}
//Instance.OnPlayerChat((event) => {
//    const text = (event.text || "").trim().toLowerCase().split(' ')[0];
//    const num=Number((event.text || "").trim().toUpperCase().split(' ')[1]);
//    if (text === "debug" || text === "!debug")
//    {
//        init();
//        pathfinder.debug(60);
//        pd=true;
//    }
//    if (text === "c" || text === "!c")
//    {
//        const p=event.player?.GetPlayerPawn();
//        if(p)
//        {
//            const pos=p.GetAbsOrigin();
//            start={x:pos.x,y:pos.y,z:pos.z};
//        }
//    }
//    if (text === "v" || text === "!v")
//    {
//        const p=event.player?.GetPlayerPawn();
//        if(p)
//        {
//            const pos=p.GetAbsOrigin();
//            end={x:pos.x,y:pos.y,z:pos.z};
//        }
//    }
//});
//Instance.SetThink(() => {
//    if(pd==true)
//    {
//        var players=Instance.FindEntitiesByClass("player");
//        players.forEach((e)=>{
//            if(e&&e instanceof CSPlayerPawn)
//            {
//                var p=e.GetPlayerController()?.GetPlayerPawn();
//                if(p)
//                {
//                    const pos=p.GetAbsOrigin();
//                    end={x:pos.x,y:pos.y,z:pos.z};
//                    return;
//                }
//            }
//        })
//        for(let i=0;i<1;i++)pathfinder.findPath(start,end);
//    }
//    Instance.SetNextThink(Instance.GetGameTime()+1/1);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/1);
//let start={x:-90,y:-2923,z:607};
//let end={x:-90,y:-2923,z:607};
//let pd=false;
//let se=false;
//Instance.OnBulletImpact((event)=>{
//    if(se==true)end=event.position;
//    else start=event.position;
//    //se=!se;
//});