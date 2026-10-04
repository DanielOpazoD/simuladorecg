import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fromPreset,presetById} from '../src/presets/catalog';
import {changeCase} from '../src/ui/case-state';
import {createExplorationOrigin,explorationChanges,sameExplorationModel,restoreExplorationOrigin} from '../src/ui/exploration-origin';

describe('Regional activation has its own exploration provenance',()=>{
  it('changing only the activation model cannot overwrite the captured origin',()=>{
    const preset=presetById('rbbb'),c=fromPreset(preset),origin=createExplorationOrigin(preset,c);
    const regional=changeCase(c,'activationModel','regional-rbbb-v1');
    assert.equal(sameExplorationModel(origin,regional),false);
    assert.deepEqual(explorationChanges(origin,regional),[{
      key:'activationModel',label:'Modelo de activación QRS',before:'template',after:'regional-rbbb-v1',
    }]);
    assert.equal(origin.case.activationModel,'template');
    const restored=restoreExplorationOrigin(origin,changeCase(regional,'view.speed',50));
    assert.equal(restored.activationModel,'template');
    assert.equal(restored.presetId,'rbbb');
    assert.equal(restored.view.speed,50);
    assert.equal(sameExplorationModel(origin,restored),true);
  });
  it('a stored but unavailable regional mode is still a model change, not a preset',()=>{
    const preset=presetById('sinus'),c=fromPreset(preset),origin=createExplorationOrigin(preset,c);
    assert.equal(sameExplorationModel(origin,changeCase(c,'activationModel','regional-rbbb-v1')),false);
  });
});
