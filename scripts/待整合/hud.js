import {Instance, PointTemplate} from "cs_script/point_script";

export class hud
{
    /**
     * @param {import("cs_script/point_script").CSPlayerPawn} player
     * @param {string} type
     * @returns
     */
    constructor(player,type) {
        this.name=`${type}_${player.GetPlayerController()?.GetPlayerSlot()}`;
        /** @type {import("cs_script/point_script").CSPlayerPawn} */
        this.player=player;
        /** @type {import("cs_script/point_script").Entity|undefined} */
        this.entity=Instance.FindEntityByName(this.name);
        this.time=Instance.GetGameTime();
        this.use=false;
        if(!this.entity)
        {
            const template = Instance.FindEntityByName(`${type}_template`);
            if (template && template instanceof PointTemplate) {
                const spawned = template.ForceSpawn();
                if (spawned && spawned.length > 0) {
                    spawned[0].SetEntityName(this.name);
                    this.entity=spawned[0];
                }
            }
            Instance.EntFireAtName({
                name:this.name,
                input:`disable`,
            });
        }
    }
    /**
     * @param {number} health
     * @returns
     */
    sethealth(health)
    {
        var text=["","▎","▎","▍","▍","▋","▋","▊","▊","▉","▉"];
        var str=text[10].repeat(Math.floor(health/10))+text[Math.floor(health%10)];
        Instance.EntFireAtName({
            name:this.name,
            input:`SetMessage`,
            value:str
        });
    }
    show()
    {
        if(!this.use)
        {
            this.use=true;
            Instance.EntFireAtName({
                name:this.name,
                input:`Enable`
            });
        }
        this.time=Instance.GetGameTime();
    }
    /**
     * @param {number} time
     * @returns
     */
    check(time)
    {
        if(this.entity&&this.use)
        {
            if(Instance.GetGameTime()-this.time>=time)
            {
                this.use=false;
                Instance.EntFireAtName({
                    name:this.name,
                    input:`Disable`
                });
            }
        }
    }
    /**
     * 血条
     * @param {import("cs_script/point_script").Vector} player
     * @param {import("cs_script/point_script").QAngle} ag
     * @param {import("cs_script/point_script").Vector} monster
     * @returns
     */
    teleport2(player,ag,monster)
    {
        var radius=15;
        /** @type {import("cs_script/point_script").Vector} */
        var d = {
            x:monster.x - player.x,
            y:monster.y - player.y,
            z:monster.z - player.z
        };
        var distanceOA = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
        /** @type {import("cs_script/point_script").Vector} */
        var u = {
            x:d.x/ distanceOA,
            y:d.y/ distanceOA,
            z:d.z/ distanceOA
        };
        if(this.entity)
        {
            this.entity.Teleport({
            position:{
                x:player.x+radius*u.x,
                y:player.y+radius*u.y,
                z:player.z+radius*u.z
            },
            angles:{
                pitch:0,
                yaw:270+ag.yaw,
                roll:90-ag.pitch
            },
            });
        }
    }
    /**
     * 粘脸上
     * @param {import("cs_script/point_script").Vector} ps
     * @param {import("cs_script/point_script").QAngle} ag
     * @returns
     */
    teleport(ps,ag)
    {
        var radius=11;
        //Instance.Msg(`x:${ps.x} y:${ps.y} z:${ps.z}`);
        //Instance.Msg(`pitch:${ag.pitch} yaw:${ag.yaw} roll:${ag.roll}`);
        var x=ps.x + radius * Math.cos(ag.pitch*Math.PI / 180) * Math.cos(ag.yaw*Math.PI / 180);
        var y=ps.y + radius * Math.cos(ag.pitch*Math.PI / 180) * Math.sin(ag.yaw*Math.PI / 180);
        var ox=ps.x + radius * Math.cos(0*Math.PI / 180) * Math.cos(ag.yaw*Math.PI / 180);
        var oy=ps.y + radius * Math.cos(0*Math.PI / 180) * Math.sin(ag.yaw*Math.PI / 180);
        if(this.entity)
        {
            this.entity.Teleport({
            position:{
                x:x-2.5*(oy-ps.y)/radius,
                y:y+2.5*(ox-ps.x)/radius,
                z:ps.z - radius * Math.sin(ag.pitch*Math.PI / 180)
            },
            angles:{
                pitch:0,
                yaw:270+ag.yaw,
                roll:90-ag.pitch
            },
            });
        }
    }
}