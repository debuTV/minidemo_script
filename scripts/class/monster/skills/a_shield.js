import { BaseModelEntity, Instance } from "cs_script/point_script";
import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class ShieldSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{cooldowntime:number,runtime:number,value:number}} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "Shield";
        this.type="Active";
        this.cooldowntime=params.cooldowntime;
        this.runtime=params.runtime;
        this.maxshield=params.value;
        this.shield=0;
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(this.running)
        {
            if(event.type=="OntakeDamage")
            {
                this.shield-=event.value;
                this.monster.health+=event.value;
                this.monster.breakable.SetHealth(10000-(this.monster.maxhealth-this.monster.health));
                if(this.shield<=0)
                {
                    this.running=false;
                    if(this.monster.model instanceof BaseModelEntity)
                    {
                        this.monster.model.Unglow();
                    }
                    //护盾最后一点护盾值也能抵消这次伤害
                }
            }
            return false;
        }
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        return true;
    }
    tick()
    {
        if (!this.running) return;
        if (this.runtime!=-1&&this.lastTriggerTime+this.runtime<=Instance.GetGameTime())
        {
            this.running=false;
            if(this.monster.model instanceof BaseModelEntity)
            {
                this.monster.model.Unglow();
            }
            return;
        }
    }
    request()
    {
        this.monster.requestSkill(this.id);
    }
    trigger() 
    {
        this.shield=this.maxshield;
        if(this.monster.model instanceof BaseModelEntity)
        {
            this.monster.model.Glow({r:0,g:0,b:255});
        }
        this.running=true;
        this._markTriggered();
    }
}