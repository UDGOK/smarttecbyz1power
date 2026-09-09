import {handle} from '../../../smarttec-investor/server/handlers.mjs';
export const prerender=false;
export const ALL=({request,params})=>handle(request,params.action);
