import { Router } from "express";
import OpenAI from "openai";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/ai/generate-description
 * body: { imageUrl: string }
 * 
 * 이미지를 분석해서 상품 설명문을 자동으로 생성합니다.
 */
router.post("/generate-description", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ ok: false, error: "이미지 URL이 필요합니다" });
        }

        // ✅ OpenAI Vision API 호출
        const response = await openai.chat.completions.create({
            model: "gpt-5",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl,
                            },
                        },
                        {
                            type: "text",
                            text: `이 상품의 사진을 보고 중고거래 상품 설명문을 작성해주세요.

다음 형식으로 작성해주세요:
- 상품명: (상품의 이름 + 간단한 수식어, 자연스럽게)
- 상태: (상품의 상태 - 미개봉/최상/상/중상/중/중하/하)
- 브랜드: (브랜드명, 있으면)
- 설명: (3~5줄의 상세한 설명)

JSON 형식으로 응답해주세요:
{
  "title": "상품명",
  "quality": "상태",
  "brand": "브랜드",
  "description": "상세설명"
}`,
                        },
                    ],
                },
            ],
            max_completion_tokens: 700,
        });

        // ✅ 응답 파싱
        const content = response.choices[0].message.content;
        let result;

        try {
            // JSON 추출 시도
            const jsonMatch = content?.match(/\{[\s\S]*\}/);
            result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (e) {
            console.error("JSON 파싱 실패:", e);
            result = { description: content };
        }

        return res.json({
            ok: true,
            data: {
                title: result?.title || "",
                quality: result?.quality || "",
                brand: result?.brand || "",
                description: result?.description || "",
            },
        });
    } catch (err: any) {
        console.error("AI 설명문 생성 에러:", err);
        return res.status(500).json({
            ok: false,
            error: err.message || "설명문 생성 실패",
        });
    }
});

export default router;