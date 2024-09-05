import { ccc } from "@ckb-ccc/connector-react";
import { useMemo } from "react";
import { useGetExplorerLink } from "../utils";

export function Scripts({
  scripts,
}: {
  scripts: Map<string, { color: string; script: ccc.Script }>;
}) {
  const { client }  = ccc.useCcc();
  const { explorerAddress } = useGetExplorerLink();

  const scriptsList = useMemo(
    () =>
      Array.from(scripts.entries(), ([key, { script, color }]) => (
        <div
          key={key}
          className="p-2 py-4 flex flex-col"
          style={{
            backgroundColor: color,
          }}
        >
          <div className="text-sm text-gray-300 -mb-1">address</div>
          <div className="break-all">
            {explorerAddress(
              ccc.Address.from({
                prefix: client.addressPrefix,
                script,
              }).toString()
            )}
          </div>
          <div className="text-sm text-gray-300 -mb-1">scriptHash</div>
          <div className="break-all">{key}</div>
          <div className="text-sm text-gray-300 -mb-1">codeHash</div>
          <div className="break-all">{script.codeHash}</div>
          <div className="text-sm text-gray-300 -mb-1">hashType</div>
          <div className="break-all">{script.hashType}</div>
          <div className="text-sm text-gray-300 -mb-1">args</div>
          <div className="break-all">{script.args}</div>
        </div>
      )),
    [scripts, explorerAddress, client]
  );

  return <div className="flex flex-col grow justify-start overflow-y-auto">{scriptsList}</div>;
}
