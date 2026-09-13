import type {SceneContext,StageScene,TierSettings} from './types';

/** The final chapter is a DOM image gallery, with no campus geometry to download. */
export class CampusPreviewScene implements StageScene {
  readonly id='campus';
  readonly static=true;
  build(ctx:SceneContext):void{ctx.scene.background=null;ctx.scene.fog=null;}
  update():void{}
  setWorldMix():void{}
  onTier(_settings:TierSettings,ctx:SceneContext):void{this.frame(ctx);}
  frame(ctx:SceneContext):void{ctx.camera.position.set(0,0,10);ctx.camera.lookAt(0,0,0);}
  dispose():void{}
}
