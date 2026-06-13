import type {MintFlowModel} from "../core/flowModel.js";

export function renderJson(model: MintFlowModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}
