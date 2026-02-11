import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class PounceSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{cooldowntime:number,distance:number,animation:string}} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "Pounce";
        this.type="Active";
        this.cooldown = params.cooldowntime;
        this.distance=params.distance;
        this.anim=params.animation;
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnTick")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        const dist = this.monster.distanceTo(this.monster.target);
        this.dt=event.dt;
        this.allmpos=event.allmpos;
        return dist > this.monster.attackdist && dist < this.distance;
    }
    tick() {
        if (!this.running) return;
        if(this.monster.movelocomotion.controller.currentName!="pounce")
        {
            this.running=false;
            this.monster.movelocomotion.pathFollower.clear();
        }
        this.monster.movelocomotion.resume();
        this.monster.movelocomotion.update(this.dt,this.allmpos);
        return;
    }
    request()
    {
        this.monster.requestSkill(this.id);
    }
    trigger() 
    {
        if(!this.monster.target)return;
        this.running = true;
        const targetPos = this.monster.target.GetAbsOrigin();
        this.monster.movelocomotion.controller.setMode("pounce",targetPos);
        this.monster.animator.play(this.anim);
        this._markTriggered();
    }
}