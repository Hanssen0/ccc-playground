import { ccc } from "@ckb-ccc/connector-react";
import { MutableRefObject, useEffect, useMemo, useState } from "react";
import { Cell } from "../components/Cell";

export function Transaction({
  tx,
  scripts,
  disableScroll,
  innerRef,
}: {
  tx: ccc.Transaction;
  scripts: Map<string, { color: string; script: ccc.Script }>;
  disableScroll?: boolean;
  innerRef?: MutableRefObject<HTMLDivElement | null>;
}) {
  const { client } = ccc.useCcc();

  const [inputAmount, setInputAmount] = useState(ccc.Zero);
  useEffect(() => {
    (async () => {
      const inputAmount = await tx.getInputsCapacity(client);
      setInputAmount(inputAmount);
    })();
  }, [tx, client]);
  const outputAmount = useMemo(() => tx.getOutputsCapacity(), [tx]);

  const inputs = useMemo(
    () =>
      tx.inputs.map((input, i) => (
        <Cell cell={input} scripts={scripts} key={i} />
      )),
    [tx, scripts]
  );
  const outputs = useMemo(
    () =>
      tx.outputs.map((cellOutput, i) => (
        <Cell
          cell={{ cellOutput, outputData: tx.outputsData[i] }}
          scripts={scripts}
          key={i}
        />
      )),
    [tx, scripts]
  );

  return (
    <div
      ref={innerRef}
      className={`flex flex-col grow ${disableScroll ? "" : "overflow-hidden"}`}
    >
      <div
        className={`flex flex-col basis-1/2 ${
          disableScroll ? "" : "overflow-y-hidden"
        }`}
      >
        <div className="p-3 pb-0">
          Inputs ({ccc.fixedPointToString(inputAmount)} CKB)
        </div>
        <div className={`${disableScroll ? "" : "overflow-y-auto"} p-3 grow`}>
          <div className="flex gap-2 flex-wrap justify-center">{inputs}</div>
        </div>
      </div>

      <div
        className={`flex flex-col border-t border-fuchsia-900 basis-1/2 ${
          disableScroll ? "" : "overflow-y-hidden"
        }`}
      >
        <div className="p-3 pb-0">
          Outputs ({ccc.fixedPointToString(outputAmount)} +{" "}
          {outputAmount > inputAmount
            ? "?"
            : ccc.fixedPointToString(inputAmount - outputAmount)}{" "}
          CKB)
        </div>
        <div className={`${disableScroll ? "" : "overflow-y-auto"} p-3 grow`}>
          <div className="flex gap-2 flex-wrap justify-center">{outputs}</div>
        </div>
      </div>
    </div>
  );
}
