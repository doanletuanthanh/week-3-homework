# Digest A: tools, alternatives, pricing (round 1, researcher 1)

Run date: 2026-09-22. Budget used: 18 research tool calls, about 16 distinct sources read. All claims below trace to a source retrieved in this run. Anything not evidenced is marked as an unverified belief.

Field format: claim | source URL | publisher | pub_date | accessed | confidence | class

## D1: AI tools for interview practice and synthetic users

### Synthetic-user research tools (they produce findings; they are not built for training)

- Synthetic Users says plans start at "$12,500/year" and use a token pool: "$2-60" per interview, about 10,000 tokens for a standard-depth interview, 20% of unused tokens roll over, and seats are unlimited. It calls itself "a discovery co-pilot" for research teams. The page has no education plan, student plan or training mode. | https://www.syntheticusers.com/pricing | Synthetic Users (vendor) | undated | accessed 2026-09-22 | high | pricing, positioning
- Synthetic Users describes a multi-agent setup in which AI participants have personality profiles and run "problem-exploration interviews". This positioning generates findings, which is the opposite of our product's "never generates findings" stance. | https://www.syntheticusers.com/ | Synthetic Users | undated | accessed 2026-09-22 | medium (via search snippet) | positioning
- Other tools in the same category as synthetic users or AI-moderated research: Persona Chat, which lets you interview AI personas "to glean actionable insights"; atypica.AI, which builds personas from deep interviews; Heysho's User Interview AI Generator, which simulates 10 personas with LangGraph; and Outset, Perspective AI and Koji, which are AI-moderated interviews with real people. Every one of them aims at research output, not interviewer training. | https://prototypr.io/toolbox/persona-chat-ai ; https://atypica.ai/persona-simulation ; https://heysho.com/en/tool/user-interview.html ; https://outset.ai/ ; https://www.koji.so/blog/mom-test-customer-interviews-2026 | various vendors | undated or 2026 | accessed 2026-09-22 | medium (search snippets only) | positioning
- Maze and Contentsquare frame AI mainly as a way to scale or automate interviews (AI moderation, analysis). Contentsquare also suggests using ChatGPT personas for "mock interviews" as a dry run before real users. | https://maze.co/guides/user-interviews/ai/ ; https://contentsquare.com/guides/user-interviews/ai/ | Maze; Contentsquare | undated | accessed 2026-09-22 | medium | positioning, feature

### Closest analogues: interview-skill practice with hidden information

- **mom-test (open-source Claude Code skills, MIT, 12 commits).** It has a roleplay mode and a "league". Its personas hold "hidden facts" that the founder must draw out. One example is a dermatology office manager with undisclosed past fee attempts. Each run is scored on a "15-item scorecard /75", and the debrief gives "Signal / Why / Say next / Don't say" guidance tied to specific turns. It tracks weakness across runs ("Weakest: pitching (2 of 3 runs)"). The README does not document replay from a missed moment. It is for founders doing customer discovery, not UX/BA learners, and it needs Claude Code, so it is developer-only. **This is the closest match to our concept (hidden info plus turn-tied feedback) found in this run.** | https://github.com/sreshtalluri/mom-test | GitHub (individual developer) | undated (no date visible) | accessed 2026-09-22 | medium (README only; not run) | feature
- MomTest.ai checks a user's customer-discovery questions against Mom Test principles. It critiques question lists and is not a conversational practice partner. | https://www.momtest.ai/about | MomTest.ai | undated | accessed 2026-09-22 | medium (snippet) | feature
- momtest-ai (GitHub) runs AI-led interviews and produces "evidence-based reports". This is research automation, not practice. | https://github.com/TunaKomurcu/momtest-ai | GitHub | undated | accessed 2026-09-22 | medium (snippet) | positioning

### Academic prototypes

- **PEARL (Persona Emulating Adaptive Research and Learning Bot)**, by Sabbaghan and Brown, 23 Feb 2024. It is built on the GPT-4 API. Graduate students practise research interviews on it without needing ethics approval. Users type in the persona description themselves; the article does not say personas hold hidden or predefined information. The output is a verbatim transcript for self-reflection, with no scored or evidence-cited feedback. Students reported more confidence and "varying authenticity". Limits: n=4, text only. | https://onlineinnovationsjournal.com/forthcoming_articles/51770.html | IJIOE (journal) | 2024-02-23 | accessed 2026-09-22 | high | feature, positioning
- A 2025 paper on interviewing AI-generated personas, "talking to your data", appeared in search results but was not read. | https://www.bernardjjansen.com/uploads/2/4/1/8/24188166/2025334437.pdf | Jansen et al. | 2025 | accessed 2026-09-22 | low (not read) | positioning

### General roleplay and coaching platforms (sales, job interviews)

- **Yoodli** individual pricing: Starter is free with 5 lifetime roleplays; Pro is $8/mo billed annually with up to 10 roleplays a week; Advanced is $20/mo billed annually with unlimited roleplays and is "reimbursable as a professional development" expense. Team and Enterprise are custom and add "custom AI roleplays", rubric-based scoring, and LMS/HRIS integrations. No university tier is listed. | https://www.yoodli.ai/pricing | Yoodli (vendor) | undated, seen 2026-09-22 | accessed 2026-09-22 | high | pricing
- Yoodli is used by university career centres (University of Washington) for roleplay practice before job interviews. This is a signal for the B2B2C route into universities, but for job interviews, not research interviews. | https://careers.uw.edu/blog/2025/01/08/test-tags/ | UW Career & Internship Center | 2025-01-08 | accessed 2026-09-22 | medium (snippet) | traction
- **Hyperbound** (AI sales roleplay, founded 2023, San Francisco). Its free tier has "9 pre-built roleplay bots", unlimited call time and AI coaching feedback. Paid pricing is not public; a competitor review quotes "$70/user/month at 50 seats and $63/user/month at 150 seats". It markets "2M+ hours of simulated calls". | https://www.outdoo.ai/blog/hyperbound-review-and-pricing ; https://www.hyperbound.ai/ | Outdoo (competitor, so it may overclaim); Hyperbound | 2026 | accessed 2026-09-22 | medium on features, low-medium on price (secondary, competitor-authored) | pricing, feature
- Mockin and the itch.io "AI Job Interview Simulator" target UX/UI designers practising **job** interviews (STAR method, portfolio review). The category name "UX interview practice" is already used for job-interview prep, which is a risk to discoverability and positioning. | https://mockin.work/ ; https://pazoff.itch.io/job-interview-simulator | vendors | undated / 2025 | accessed 2026-09-22 | medium | positioning

### General chatbots

- Practitioner guides tell people to build their own ChatGPT persona for mock user interviews, for example a Substack "AI interview practice environment" with a free template, and ChatGPT personas "incorporating real-world user behaviors... even contradictions". Do-it-yourself chatbot roleplay is the default free substitute. | https://maryma.substack.com/p/build-your-ai-interview-practice ; https://contentsquare.com/guides/user-interviews/ai/ | Substack author; Contentsquare | undated | accessed 2026-09-22 | medium | sentiment, positioning
- IIBA and Adaptive US say generative AI can "simulate different stakeholder personas" to help BAs prepare for elicitation. They present this as a prompting technique, not a product. | https://www.adaptiveus.com/blog/requirements-elicitation-with-generative-ai-tools/ ; https://www.iiba.org/business-analysis-blogs/enrich-business-analysis-experience-for-your-stakeholders-using-ai-tools/ | Adaptive US; IIBA | undated | accessed 2026-09-22 | medium | positioning

## D2: Non-AI alternatives

- **NN/g "User Interviews" live online course** costs US$1,215 for the 1-day format (7 h) or US$1,220 for the 2-day format. It is on Zoom and includes "hands-on practice" through peer exercises with instructor guidance on probing and difficult participants. It counts toward NN/g UX Certification. | https://www.nngroup.com/courses/user-interviews/ | Nielsen Norman Group | undated, dates listed Nov/Dec | accessed 2026-09-22 | high | pricing, feature
- NN/g self-paced courses start at $49. The UX Certificate costs about $6,500 and UX Master about $19,500, with an $80 exam fee each (third-party figure). Team training is $15,500 per course for up to 70 people. | https://www.nngroup.com/contents/self-paced-courses/ ; https://www.cobeisfresh.com/blog/nn-g-online-ux-conference-and-certification | NN/g; COBE (third party) | undated | accessed 2026-09-22 | medium (from snippets; certification totals are secondary) | pricing
- **Interaction Design Foundation** courses are included in membership at "€15/month", per a Vietnamese aggregator. That figure may be stale; it was not checked on IDF's site. | https://itviec.com/blog/khoa-hoc-ui-ux/ | ITviec Blog | 2024 | accessed 2026-09-22 | low | pricing
- Other global courses cited by the same aggregator: Udemy UX fundamentals at $20.99, Skillshare at $39/mo, SuperHi at $149, Udacity UI/UX free. The aggregator's Coursera "$7,505–$7,900" figure looks wrong and should not be used. | https://itviec.com/blog/khoa-hoc-ui-ux/ | ITviec Blog | 2024 | accessed 2026-09-22 | low | pricing
- **ADPList** is "100% free", with volunteer mentors (36,000–40,000+ claimed) and no premium tier. ADPList cites paid alternatives: MentorCruise at "$50–$500/month" and paid platforms at "$100–$500 per session". These figures come from ADPList's own comparison page, so ADPList is describing its competitors. | https://adplist.org/guides/best-mentorship-platforms ; https://intercom.help/adplist-community/en/articles/8484119-is-adplist-free-to-use | ADPList | 2026 | accessed 2026-09-22 | high on ADPList being free, low-medium on competitor prices | pricing
- Practice value, which is my inference and not sourced: ADPList sessions give career advice and portfolio review. This run found no evidence that ADPList mentors run structured mock user interviews.

## D7: Who pays (pricing signals)

### Global, individual

- AI practice tools for individuals cost $0–20/mo (Yoodli: free, $8/mo, $20/mo), with free tiers limited by session count. | https://www.yoodli.ai/pricing | high | pricing
- Enterprise roleplay tools sell per seat at about $63–70 per user per month, which is a B2B price point. | https://www.outdoo.ai/blog/hyperbound-review-and-pricing | low-medium | pricing
- Synthetic research tools sell annual contracts from $12.5k/yr, so they are out of reach for students. | https://www.syntheticusers.com/pricing | high | pricing
- Structured human practice is expensive: NN/g charges about $1.2k per course day. | https://www.nngroup.com/courses/user-interviews/ | high | pricing

### Vietnam

- **Keyframe** (offline UX/UI "Digital Product Design" course): 5,220,000 VND early-bird (list price 5,800,000 VND) for 12 sessions, with instalments available. The page's curriculum is tools-heavy (HTML/CSS, design systems, Webflow/Framer, AI tools) and **does not explicitly list user research or interview practice.** | https://keyframe.vn/khoa-hoc-offline/khoa-hoc-thiet-ke-ux-ui-digital-product-design-39.html | Keyframe (vendor) | undated | accessed 2026-09-22 | high | pricing, feature
- **BAC (Business Analysis Center)** BA courses cost about 9,000,000–12,000,000 VND. Other BA courses cost 3,190,000 VND (20 h) and 6,500,000 VND (the ITBA course at BAA). These figures come from aggregator or blog snippets, not BAC's own page. | https://som.edu.vn/khoa-hoc-business-analyst/ ; https://blog.freec.asia/khoa-hoc-business-analyst/ | SOM; freeC blog | undated | accessed 2026-09-22 | low-medium | pricing
- Other Vietnamese providers seen but not priced this run: ColorME, GetDesign (site did not resolve), Capi Demy, MindX, VTI Academy, BKACAD, IPMAC, bacs.vn. There is also a "khoahocre.com" site selling cut-price course copies, which signals price sensitivity (my inference). | search results | various | accessed 2026-09-22 | low | pricing

## Leads worth chasing

1. Install and run sreshtalluri/mom-test roleplay to check hidden facts, scoring, and whether any replay exists. It is the closest prior art.
2. IJIOE PEARL authors (University of Calgary). Check whether a follow-up exists with scripted hidden information or grounded feedback.
3. Yoodli and Hyperbound education or university licensing. Yoodli's UW career-centre use suggests there is a route to sell through university career centres.
4. Medical OSCE / standardized-patient AI sims, which are the obvious hidden-information-plus-rubric analogue, and their university licensing models. Not searched in this run (budget).
5. Second Nature, Exec and Rehearsal pricing. Not retrieved this run.
6. Primary Vietnamese prices for UXVN, CyberSoft, FUNiX, MindX and Techmaster, plus Vietnamese mentor rates. Search returned only aggregators.
7. Reddit threads (r/UXResearch, r/userexperience) on ChatGPT mock interviews: 1–3 star sentiment on sycophancy and personas being too forthcoming. Not searched.
8. UXtweak and Userology AI features. Not retrieved.

## Looked for but could not find

- **No commercial product found that combines a fixed hidden-information persona, an end-of-session reveal with turn-level evidence, and replay from a missed moment for UX/BA/PM learners.** Searches run: "practice user interviews with AI persona", "AI user interview simulator UX students", "business analyst requirements elicitation practice AI simulator", "Mom Test customer discovery practice AI simulator". The only hidden-information example was an open-source developer tool for founders (mom-test), and its documentation shows no replay.
- **No dedicated BA stakeholder-elicitation simulator product found.** Only articles advising people to prompt ChatGPT or Claude to play stakeholders.
- **No education or student pricing** from Synthetic Users or Yoodli.
- **Replay from a turn** did not appear in any tool retrieved this run.
- Vietnamese UX course pages found this run (Keyframe) do not advertise interview-practice components. Absence on one vendor page is weak evidence.
- Not verified this run: IDF current price, Google UX Certificate / Coursera price, Teresa Torres Continuous Interviewing price, and IIBA course prices.
