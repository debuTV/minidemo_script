import { CSPlayerPawn } from "cs_script/point_script";

export class player_button
{
    /**
     * @param {CSPlayerPawn} player
     */
    constructor(player)
    {
        this.player=player;
        this.enable=false;
        this.Angles=player.GetAbsAngles();
        this.Position=player.GetAbsOrigin();
        this.input = {"W": false,"A": false,"S": false,"D": false,"Jump":false,"Duck":false};
        this.lastInput = {"W": false,"A": false,"S": false,"D": false,"Jump":false,"Duck":false};
    }
    //离开商城
    stop()
    {
        this.enable=false;
    }
    //进入商城
    start()
    {
        const eye=this.player.GetAbsAngles();
        this.Angles.pitch=eye.pitch;
        this.Angles.roll=eye.roll;
        this.Angles.yaw=eye.yaw;
        const foot=this.player.GetAbsOrigin();
        this.Position.x=foot.x;
        this.Position.y=foot.y;
        this.Position.z=foot.z;
        this.enable=true;
        this.input = {"W": false,"A": false,"S": false,"D": false,"Jump":false,"Duck":false};
        this.lastInput = {"W": false,"A": false,"S": false,"D": false,"Jump":false,"Duck":false};
    }
    //商店每tick调用，根据返回的值更新商店
    //是否有新的按键，新的按键是什么
    nextInput()
    {
        if (!this.enable) return null;
        this.update();
        for (const key of ["Jump", "W", "S", "A", "D", "Duck"])
        {
            // @ts-ignore
            if (this.input[key] && !this.lastInput[key])
            {
                this.lastInput = { ...this.input };
                return key;
            }
        }

        this.lastInput = { ...this.input };
        return null;
    }
    //调用一次更新当前按键
    update()
    {
        if(!this.enable)return;
        const ang=this.player.GetAbsAngles();
        const vel=this.player.GetAbsVelocity();
        const pos=this.player.GetAbsOrigin();
        const duck=this.player.GetEyePosition().z-pos.z;
        const { forward, right } = this.yawToVectors(ang.yaw);

        const forwardSpeed = this.dot(vel, forward);
        const sideSpeed    = this.dot(vel, right);
        this.input = {"W": false,"A": false,"S": false,"D": false,"Jump":false,"Duck":false};
        if(Math.abs(forwardSpeed)>Math.abs(sideSpeed))
        {
            if (forwardSpeed >  1) this.input["W"] = true;
            if (forwardSpeed < -1) this.input["S"] = true;
        }
        else
        {
            if (sideSpeed <  -1) this.input["D"] = true;
            if (sideSpeed > 1) this.input["A"] = true;
        }
        if(vel.z>10)this.input["Jump"]=true;
        if(duck<=46)this.input["Duck"]=true;
        this.player.Teleport({position:{x:this.Position.x,y:this.Position.y,z:pos.z},angles:{pitch:ang.pitch,roll:ang.roll,yaw:this.Angles.yaw}});
        
        return;
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    /**
     * @param {number} yawDeg
     */
    yawToVectors(yawDeg) {
        const yaw = yawDeg * Math.PI / 180;

        const forward = {
            x: Math.cos(yaw),
            y: Math.sin(yaw),
            z: 0,
        };

        const right = {
            x: -Math.sin(yaw),
            y: Math.cos(yaw),
            z: 0,
        };

        return { forward, right };
    }
}