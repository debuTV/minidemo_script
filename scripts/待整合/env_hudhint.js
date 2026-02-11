import { Instance } from "cs_script/point_script";
export class env_hudhint
{
    /**
     * @param {import("cs_script/point_script").CSPlayerPawn} player
     * @returns
     */
    constructor(player)
    {
        this.player=player;
    }
    /**
     * @param {string} message
     * @returns
     */
    CreateHud(message) { 
        Instance.ServerCommand(`ent_create env_hudhint {"targetname" "playerDisplay" "message" "${message}"}`);
    };
    DestroyHud() { 
        Instance.ServerCommand(`ent_fire playerDisplay kill`);
    };
    UpdateHud()
    {
        this.DestroyHud();
        this.CreateHud(`Time: ${Instance.GetGameTime()} money:100 \r level:1/10 exp:0/100`);
        Instance.EntFireAtName({
            name:"playerDisplay",
            input:"showHudHint",
            activator:this.player
        });
    }
}