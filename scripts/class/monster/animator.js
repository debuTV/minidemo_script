import { Entity, Instance } from "cs_script/point_script";
import { MonsterState } from "./monster";

export class MonsterAnimator {
    /**
     * @param {Entity} model
     * @param {any} typeConfig
     */
    constructor(model, typeConfig) {
        this.model = model;
        this.animConfig = typeConfig.animations;
        this.locked = false;// 是否处于动作占用期
        this.currentstats=-1;// 当前动画对应的 MonsterState
        //攻击结束回调
        this.onAttackFinish=null;

        Instance.ConnectOutput(this.model,"OnAnimationDone",(e)=>{
            //动画播放完了
            this.locked = false;
            this.onStateFinish?.(this.currentstats);
        });
    }
    /**
     * @param {(state: number) => void} callback
     */
    setonStateFinish(callback)
    {
        this.onStateFinish=callback;
    }
    /**
     * @param {number} state
     */
    tick(state) {
        if (this.locked) return;
        this.currentstats=state;
        switch (state) {
            case MonsterState.IDLE:
                this.play("idle");
                break;
            case MonsterState.CHASE:
                this.play("walk");
                break;
            case MonsterState.ATTACK:
                this.play("attack");
                break;
            case MonsterState.SKILL:
                this.play("skill");
                break;
        }
    }
    /**
     * Animator 是否允许切换到 nextState
     * @param {number} nextState - MonsterState
     */
    canSwitch(nextState) {
        const now = Instance.GetGameTime();
        if (!this.locked) {
            return true;
        }
        if (this.currentstats==MonsterState.ATTACK||this.currentstats==MonsterState.SKILL) {
            return false;
        }
        return true;
    }
    /**
     * 强制播放
     * @param {number} nextState
     */
    enter(nextState) {
        this.currentstats=nextState;
        switch (nextState) {
            case MonsterState.IDLE:
                this.play("idle");
                break;
            case MonsterState.CHASE:
                this.play("walk");
                break;
            case MonsterState.ATTACK:
                this.play("attack");
                break;
            case MonsterState.SKILL:
                this.play("skill");
                break;
        }
    }
    /**
     * @param {string} type
     */
    play(type) {
        const list = this.animConfig[type];
        if (!list || list.length === 0) return null;
        const anim = list[Math.floor(Math.random() * list.length)];
        if (!anim) return;
        Instance.EntFireAtTarget({target:this.model,input:"SetAnimation",value:anim});
        this.locked=true;
    }
}
