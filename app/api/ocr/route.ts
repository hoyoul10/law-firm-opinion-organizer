// POST /api/ocr — 스캔한 PDF의 쪽 그림(JPEG)을 AI가 글자로 읽는다.
// 담당자가 [OCR로 읽기]를 눌렀을 때만 호출된다. 그림은 저장하지 않고, OpenAI에도 보관하지 않는다 (store: false).
// 로그에는 쪽 수와 오류 종류만 남긴다 (Design Ref: §13.3, §7)

import type { ResponseInput } from "openai/resources/responses/responses";
import { AiCallError, requestStructured } from "@/lib/server/openai";
import { ocrInstructions } from "@/lib/server/prompts";
import { errorFromParse, errorResponse, logFailure, rejectForeignRequest } from "@/lib/server/respond";
import { OcrOutputSchema, OcrRequestSchema } from "@/lib/server/schemas";
import { validateOcrOutput } from "@/lib/server/validate";
import type { OcrResponse } from "@/lib/reply-types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const rejected = rejectForeignRequest(request);
  if (rejected) return rejected;

  const parsed = OcrRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorFromParse(parsed.error);

  const { pages } = parsed.data;
  const requested = pages.map((p) => p.page);

  const input: ResponseInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: `다음 그림은 문서의 ${pages.length}개 쪽이다. 쪽 번호는 순서대로 ${requested.join(", ")}이다. 각 쪽의 글자를 규칙대로 옮겨 적어라.` },
        ...pages.flatMap((p) => [
          { type: "input_text" as const, text: `[쪽 ${p.page}]` },
          { type: "input_image" as const, image_url: p.image, detail: "high" as const },
        ]),
      ],
    },
  ];

  try {
    const output = await requestStructured({
      schema: OcrOutputSchema,
      schemaName: "ocr_pages",
      instructions: ocrInstructions(),
      input,
      effort: "low",
    });

    const result = validateOcrOutput(output, requested);
    if (!result.ok) {
      logFailure("ocr", "INVALID_AI_OUTPUT", { pages: pages.length, problems: result.problems.length });
      const response = errorResponse("INVALID_AI_OUTPUT");
      if (process.env.NODE_ENV !== "development") return response;
      const body = await response.json();
      return Response.json({ ...body, problems: result.problems }, { status: response.status });
    }

    const body: OcrResponse = { pages: result.pages };
    return Response.json(body);
  } catch (err) {
    const code = err instanceof AiCallError ? err.code : "AI_FAILED";
    logFailure("ocr", code, { pages: pages.length, status: err instanceof AiCallError ? err.status : undefined });
    return errorResponse(code);
  }
}
