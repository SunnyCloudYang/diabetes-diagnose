import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { inferModel, validateArtifact, validateModelInput, withDefaultEnvironment } from '../src/model.ts';
const root=fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const artifact=validateArtifact(JSON.parse(fs.readFileSync(root+'/public/model-artifact.json','utf8')));
const feature=n=>artifact.features.find(f=>f.name===n);
const cases=Array.from({length:20},(_,i)=>{
  const q=(i+1)/21;
  const value=n=>feature(n).observedMin+(feature(n).observedMax-feature(n).observedMin)*q;
  return withDefaultEnvironment(artifact,{
    age:Math.round(value('age')),sex:i%2?'男':'女',hypertension_history:i%3?0:1,
    BMI:i%4===0?null:value('BMI'),glucose:value('glucose'),
    TG:i%3===0?null:value('TG'),HDL:i%3===0?null:value('HDL'),
  });
});
const python=`import sys,json,numpy as np,pandas as pd
sys.path.insert(0,sys.argv[1]+"/scripts")
from train_model import Preprocessor,prepare_raw_frame,predict_horizon
p=json.load(sys.stdin); a=p["artifact"]; beta=[a["intercept"]]
for f in a["features"]:
 beta.append(f["coefficient"])
 if f.get("missingIndicator"): beta.append(f["missingIndicatorCoefficient"])
x=Preprocessor(a["features"],[]).transform(prepare_raw_frame(pd.DataFrame(p["cases"])))
print(json.dumps(predict_horizon(np.array(beta),x).tolist()))
`;
const expected=JSON.parse(execFileSync(root+'/.venv/bin/python',['-c',python,root],{input:JSON.stringify({artifact,cases}),encoding:'utf8'}));
const actual=cases.map(c=>inferModel(artifact,c).p3);
const maxError=Math.max(...actual.map((p,i)=>Math.abs(p-expected[i])));
assert.ok(maxError<=1e-10);
const invalid=[{...cases[1],glucose:7},{...cases[1],age:NaN},{...cases[1],age:null},{...cases[1],TG:null},{...cases[1],HDL:null},{...cases[1],BMI:Infinity}];
invalid.forEach(c=>assert.ok(validateModelInput(artifact,c).errors.length>0));
for(const intercept of [-50,50]) {
 const mutated={...artifact,intercept,features:artifact.features.map(f=>({...f,coefficient:0,missingIndicatorCoefficient:0}))};
 const p=inferModel(mutated,cases[1]).p3;
 assert.equal(p,-Math.expm1(-Math.exp(Math.max(-40,Math.min(40,intercept)))*3));
}
for(const mutate of [a=>{a.horizonYears=4},a=>{delete a.researchQuantiles},a=>{a.features[0].scale=0}]) {
 const a=structuredClone(artifact);mutate(a);assert.throws(()=>validateArtifact(a));
}
console.log(JSON.stringify({syntheticCases:cases.length,maxAbsoluteError:maxError,invalidCases:invalid.length,extremeParity:'passed',malformedArtifact:'rejected'}));
