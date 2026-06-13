import type {ReactElement} from "react";
import {render} from "ink";

export async function renderInteractive(element: ReactElement): Promise<void> {
  const instance = render(element);
  await instance.waitUntilExit();
}
