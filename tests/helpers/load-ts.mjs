import ts from 'typescript';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';

// Load the real browser modules into a simulated DOM, without external APIs.
export function loadTS(file, globals={}) {
  file=resolve(file);
  let source=readFileSync(file,'utf8').replaceAll('import.meta.env.PUBLIC_RESERVE_ENDPOINT', "''");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const require=createRequire(file);
  const localRequire=id=>{
    const path=resolve(dirname(file),id);
    return id.startsWith('.') && existsSync(path+'.ts') ? loadTS(path+'.ts',globals) : require(id);
  };
  new Function('module','exports','require',...Object.keys(globals),js)(module,module.exports,localRequire,...Object.values(globals));
  return module.exports;
}
