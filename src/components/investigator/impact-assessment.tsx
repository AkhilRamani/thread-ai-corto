"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ImpactResult, ProjectSnapshot } from "@/lib/contracts";
import { sampleRecording } from "@/lib/sample-data";
import { EvidenceSurface } from "./evidence-surface";
export function ImpactAssessment({
  enabled,
  busy,
  result,
  snapshot,
  sample,
  onAssess,
}: {
  enabled: boolean;
  busy: boolean;
  result?: ImpactResult;
  snapshot: ProjectSnapshot;
  sample: boolean;
  onAssess: (question: string) => void;
}) {
  const [question, setQuestion] = useState(
    sample ? sampleRecording.question : "",
  );
  const [assessedQuestion, setAssessedQuestion] = useState("");
  return (
    <Accordion type="single" collapsible className="mt-10 border-y">
      <AccordionItem value="requirement-change">
        <AccordionTrigger className="py-6 text-ui-item font-normal">
          Explore a requirement change
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <section aria-label="Change impact">
            <p className="text-ui-body text-muted-foreground">
              See what a requirement change could affect within the inspected
              evidence.
            </p>
            <form
              className="mt-5 flex items-start gap-3 max-[600px]:flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (enabled && !busy && question.trim().length >= 10) {
                  setAssessedQuestion(question.trim());
                  onAssess(question);
                }
              }}
            >
              <label className="sr-only" htmlFor="change-question">
                Proposed requirement change
              </label>
              <textarea
                id="change-question"
                className="min-h-12 w-full flex-1 resize-y rounded-xl border px-4 py-3 text-ui-body"
                rows={2}
                placeholder="What if recovery links expired after five minutes?"
                value={question}
                maxLength={600}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={busy}
              />
              <Button
                variant="ai"
                type="submit"
                aria-busy={busy}
                disabled={!enabled || busy || question.trim().length < 10}
              >
                {busy ? "Assessing…" : "Assess impact"}
              </Button>
            </form>
            {!enabled && (
              <p className="mt-2 text-ui-meta text-muted-foreground">
                Run an investigation on the current selection first.
              </p>
            )}
            {result && assessedQuestion === question.trim() && (
              <div className="mt-6" role="status">
                <p className="text-ui-body">{result.output.explanation}</p>
                <Accordion type="multiple">
                  {result.output.affected.map((item, i) => (
                    <AccordionItem
                      className="mt-4 border-t border-b-0"
                      value={`affected-${i}`}
                      key={i}
                    >
                      <AccordionTrigger className="text-ui-item font-medium">
                        <span>
                          {item.title}{" "}
                          <span className="text-ui-meta font-normal text-muted-foreground">
                            ·{" "}
                            {item.effect === "directly-evidenced"
                              ? "Directly evidenced"
                              : "Possible effect"}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-ui-body">{item.reason}</p>
                        <p className="mt-2 text-ui-body">
                          Check: {item.suggestedCheck}
                        </p>
                        <EvidenceSurface
                          snapshot={snapshot}
                          references={item.evidence}
                          sample={sample}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <p className="mt-4 text-ui-meta text-muted-foreground">
                  Unexamined: {result.output.unexamined.join(" ")}
                </p>
              </div>
            )}
          </section>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
