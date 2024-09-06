"use client";

import Editor from "@monaco-editor/react";
import { editor } from "monaco-editor";
import * as ts from "typescript";
import * as cccLib from "@ckb-ccc/core";
import { ccc } from "@ckb-ccc/connector-react";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { vlqDecode } from "./vlq";
import { useApp } from "./context";
import {
  Blocks,
  BookOpenText,
  Bug,
  Coins,
  FlaskConical,
  FlaskConicalOff,
  Play,
  Printer,
  Send,
  SquareArrowOutUpRight,
  SquareTerminal,
  StepForward,
} from "lucide-react";
import { Button } from "./components/Button";
import { Transaction } from "./tabs/Transaction";
import { Scripts } from "./tabs/Scripts";
import { DEFAULT_TRANSFER, DEFAULT_UDT_TRANSFER } from "./examples";
import html2canvas from "html2canvas";
import { About } from "./tabs/About";
import { Console } from "./tabs/Console";

const CCCCoreSource = require.context(
  "!!raw-loader!../../node_modules/@ckb-ccc/core",
  true,
  /(\.d.ts$|package.json)/
);

function findSourcePos(
  sourceMap: string | undefined,
  row: number,
  col: number
): [number, number, number, number] | undefined {
  if (!sourceMap) {
    return;
  }
  const lines = JSON.parse(sourceMap).mappings.split(";") as string[];

  let sRow = 0;
  let sCol = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "") {
      continue;
    }
    let nowCol = 0;
    for (const map of line.split(",").map((c: string) => vlqDecode(c))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [colInc, _, sRowInc, sColInc] = map;
      nowCol += colInc;
      if (i === row && nowCol >= col) {
        return [sRow, sRow + sRowInc, sCol, sCol + sColInc];
      }

      sRow += sRowInc;
      sCol += sColInc;
    }
  }
}

async function execute(
  source: string,
  onUpdate: (
    pos: [number, number, number, number] | undefined,
    tx: ccc.Transaction | undefined
  ) => Promise<void>,
  signer: ccc.Signer | undefined,
  log: (level: "error" | "info", title: string, msgs: ReactNode[]) => void
) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { sourceMap: true },
  });

  const exports = {};
  const require = (path: string) => {
    const lib = {
      "@ckb-ccc/core": cccLib,
      "@ckb-ccc/playground": {
        render: async (tx: ccc.Transaction | unknown) => {
          if (!(tx instanceof ccc.Transaction)) {
            return;
          }
          const stack = new Error().stack;
          if (!stack) {
            return;
          }
          const match = stack
            .split("\n")[2]
            ?.match("<anonymous>:([0-9]*):([0-9]*)\\)");
          if (!match) {
            return;
          }
          await onUpdate(
            findSourcePos(
              compiled.sourceMapText,
              Number(match[1]) - 4,
              Number(match[2]) - 2
            ),
            tx
          );
        },
        signer,
      },
    }[path];

    if (!lib) {
      return;
    }

    return lib;
  };

  try {
    await Function(
      "exports",
      "require",
      "console",
      `return (async () => {\n${compiled.outputText}\n})();`
    )(exports, require, {
      log: (...msgs: unknown[]) =>
        log(
          "info",
          "",
          msgs.map((m) =>
            JSON.stringify(m, (_, value) => {
              if (typeof value === "bigint") {
                return value.toString();
              }
              return value;
            })
          )
        ),
      error: (...msgs: unknown[]) =>
        log(
          "error",
          "",
          msgs.map((m) =>
            JSON.stringify(m, (_, value) => {
              if (typeof value === "bigint") {
                return value.toString();
              }
              return value;
            })
          )
        ),
    });
  } finally {
    await onUpdate(undefined, undefined);
  }
  return;
}

export default function Home() {
  const { openSigner, openAction, signer, messages, sendMessage } = useApp();
  const { setClient } = ccc.useCcc();

  const [editor, setEditor] = useState<
    editor.IStandaloneCodeEditor | undefined
  >(undefined);
  const decorationRef = useRef<editor.IEditorDecorationsCollection | undefined>(
    undefined
  );

  const [source, setSource] = useState(DEFAULT_TRANSFER);
  const [isRunning, setIsRunning] = useState(false);
  const [next, setNext] = useState<((abort?: boolean) => void) | undefined>(
    undefined
  );

  const [scripts, setScripts] = useState<
    Map<string, { script: ccc.Script; color: string }>
  >(new Map());
  const [tx, setTx] = useState<ccc.Transaction>(() => ccc.Transaction.from({}));
  const tabRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState("Transaction");
  const [isTestnet, setIsTestnet] = useState(true);
  const [readMsgCount, setReadMsgCount] = useState(0);

  const highlight = useCallback(
    (pos: number[] | undefined) => {
      if (!editor) {
        return false;
      }

      if (!pos) {
        decorationRef.current?.clear();
        decorationRef.current = undefined;

        return false;
      }
      const decorations = [
        {
          range: {
            startLineNumber: pos[0] + 1,
            endLineNumber: pos[1] + 1,
            startColumn: 0,
            endColumn: 0,
          },
          options: {
            isWholeLine: true,
            className: "bg-fuchsia-950",
          },
        },
        {
          range: {
            startLineNumber: pos[0] + 1,
            endLineNumber: pos[1] + 1,
            startColumn: pos[2] + 1,
            endColumn: pos[3] + 1,
          },
          options: {
            className: "bg-fuchsia-900",
          },
        },
      ];

      if (decorationRef.current) {
        decorationRef.current.set(decorations);
      } else {
        decorationRef.current = editor.createDecorationsCollection(decorations);
      }

      return true;
    },
    [editor]
  );

  const runCode = useCallback(
    async (autoPlay: boolean) => {
      setIsRunning(true);
      try {
        await execute(
          source,
          (pos, tx) => {
            if (tx) {
              setTx(ccc.Transaction.from({ ...tx }));
            }

            if (highlight(pos)) {
              return new Promise<void>((resolve, reject) => {
                const next = (abort?: boolean) => {
                  setNext(undefined);

                  if (abort) {
                    reject("ABORTED");
                  } else {
                    resolve();
                  }
                };
                setNext(() => next);
                if (autoPlay) {
                  setTimeout(next, 500);
                }
              });
            } else {
              return Promise.resolve();
            }
          },
          signer,
          sendMessage
        );
      } finally {
        setIsRunning(false);
      }
    },
    [source, signer, highlight, sendMessage]
  );

  useEffect(() => {
    setScripts(new Map());
    [tx.inputs.map((i) => i.cellOutput), tx.outputs]
      .flat()
      .map((o) => {
        if (!o) {
          return;
        }

        return [o.lock, o.type];
      })
      .flat()
      .map((script) => {
        if (!script) {
          return;
        }

        setScripts((scripts) => {
          const hash = script.hash();
          if (scripts.has(hash)) {
            return scripts;
          }

          const color = `hsl(${(
            ccc.numFrom(hash) % ccc.numFrom(360)
          ).toString()} 65% 45%)`;

          return new Map([
            ...Array.from(scripts.entries()),
            [hash, { script, color }],
          ]);
        });
      });
  }, [tx]);

  useEffect(() => {
    const source = window.localStorage.getItem("playgroundSourceCode");
    if (source) {
      setSource(source);
    }
  }, []);

  useEffect(() => {
    if (next) {
      next(true);
    }

    window.localStorage.setItem("playgroundSourceCode", source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!isRunning) {
      runCode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    setClient(
      isTestnet ? new ccc.ClientPublicTestnet() : new ccc.ClientPublicMainnet()
    );
  }, [isTestnet, setClient]);

  useEffect(() => {
    if (tab === "Console") {
      setReadMsgCount(messages.length);
      return;
    }

    if (messages.slice(readMsgCount).some(([level]) => level === "error")) {
      setTab("Console");
    }
  }, [messages, tab, readMsgCount]);

  return (
    <div
      className={`flex flex-col w-full min-h-dvh ${
        tab !== "Print" ? "lg:h-dvh lg:flex-row" : ""
      }`}
    >
      <div
        className={`basis-1/2 shrink-0 flex flex-col overflow-hidden lg:h-dvh ${
          tab !== "Print" ? "" : "hidden"
        }`}
      >
        <Editor
          className="h-[60vh] lg:h-auto w-full"
          theme="vs-dark"
          defaultLanguage="typescript"
          defaultPath="/index.ts"
          options={{
            padding: { top: 20 },
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
          value={source}
          onChange={(v) => setSource(v ?? "")}
          onMount={(editor, monaco) => {
            setEditor(editor);
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
              ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
              module: monaco.languages.typescript.ModuleKind.ESNext,
              moduleResolution:
                monaco.languages.typescript.ModuleResolutionKind.NodeJs,
              noImplicitAny: true,
              strictNullChecks: true,
            });

            monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
              {
                diagnosticCodesToIgnore: [
                  // top-level return
                  1108,
                ],
              }
            );

            CCCCoreSource.keys().forEach((key: string) => {
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                CCCCoreSource(key).default,
                "file:///node_modules/@ckb-ccc/core/" + key.slice(2)
              );
            });
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
              "import { ccc } from '@ckb-ccc/core'; export function render(tx: ccc.Transaction): Promise<void>; export const signer: ccc.Signer;",
              "file:///node_modules/@ckb-ccc/playground/index.d.ts"
            );
          }}
        />
        <div className="flex overflow-x-auto bg-gray-800 shrink-0">
          <Button onClick={() => setIsTestnet(!isTestnet)}>
            {isTestnet ? (
              <FlaskConical size="16" />
            ) : (
              <FlaskConicalOff size="16" />
            )}
            <span className="ml-1">{isTestnet ? "Testnet" : "Mainnet"}</span>
          </Button>
          {isRunning ? (
            <Button onClick={() => next?.()} disabled={!next}>
              <StepForward size="16" />
              <span className="ml-1">Continue</span>
            </Button>
          ) : (
            <>
              <Button onClick={() => runCode(true)}>
                <Play size="16" />
                <span className="ml-1">Run</span>
              </Button>
              <Button onClick={() => runCode(false)}>
                <Bug size="16" />
                <span className="ml-1">Step</span>
              </Button>
            </>
          )}
          <Button onClick={() => setSource(DEFAULT_TRANSFER)}>
            <Send size="16" />
            <span className="ml-1">Example: Transfer</span>
          </Button>
          <Button onClick={() => setSource(DEFAULT_UDT_TRANSFER)}>
            <Coins size="16" />
            <span className="ml-1">Example: UDT Transfer</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-col basis-1/2 grow shrink-0 overflow-hidden">
        {
          {
            Transaction: <Transaction tx={tx} scripts={scripts} />,
            Scripts: <Scripts scripts={scripts} />,
            Console: <Console />,
            Print: (
              <Transaction
                tx={tx}
                scripts={scripts}
                disableScroll
                innerRef={tabRef}
              />
            ),
            About: <About className="p-4 grow" />,
          }[tab]
        }
        <div className="flex overflow-x-auto bg-gray-800 shrink-0">
          <Button onClick={openSigner}>{openAction}</Button>
          <Button onClick={() => setTab("Transaction")}>
            <Blocks size="16" />
            <span className="ml-1">Transaction</span>
          </Button>
          <Button onClick={() => setTab("Scripts")}>
            <BookOpenText size="16" />
            <span className="ml-1">Scripts</span>
          </Button>
          <Button onClick={() => setTab("Console")}>
            <SquareTerminal size="16" />
            <span className="ml-1">Console</span>
          </Button>
          <Button
            onClick={() => {
              if (tab === "Print" && tabRef.current) {
                html2canvas(tabRef.current, {
                  backgroundColor: "#4a044e",
                  foreignObjectRendering: true,
                }).then((canvas) => {
                  const image = canvas.toDataURL("image/png");
                  const link = document.createElement("a");
                  link.href = image;
                  link.download = "transaction.png";
                  link.click();
                });
              }
              setTab("Print");
            }}
          >
            <Printer size="16" />
            <span className="ml-1">
              Print{tab === "Print" ? " (Click again)" : ""}
            </span>
          </Button>
          <Button onClick={() => setTab("About")}>
            <SquareArrowOutUpRight size="16" />
            <span className="ml-1">About</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
