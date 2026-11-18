"""AP Global Training Library 엑셀 → functions/tlib-seed.json (서버 가져오기 묶음)

사용: python3 -I tools/tl_import.py <엑셀 경로> [출력 경로]
- 시트: 01_Sources, 02_Observed, 03_AP_Canonical, 04_AP_Taxonomy, 06_Governance, 07_Coach_Review
- 원문(제3자 설명·사진·영상)은 엑셀에도 없고 여기서도 만들지 않는다. 제목·링크·AP 자체 분석만 옮긴다.
- 버전 불일치 정정: 8번째 Root 'Mastery' → 'Adaptability'(옛 이름은 legacyName 으로 보관). 고친 내역은 migrations 에 남긴다.
- 거버넌스 R03: REGISTRY_ONLY 출처의 관측 레코드는 넣지 않는다. R09: SWING 이 아닌 Axis 는 노드를 붙이지 않고 교차참조로만 둔다.
"""
import sys, json, re, datetime
import openpyxl

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "functions/tlib-seed.json"
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

def rows(name):
    it = wb[name].iter_rows(values_only=True)
    head = [str(h).strip() if h is not None else "" for h in next(it)]
    out = []
    for r in it:
        if not any(c not in (None, "") for c in r):
            continue
        out.append({head[i]: ("" if c is None else str(c).strip()) for i, c in enumerate(r) if i < len(head)})
    return out

NODE_RE = re.compile(r"\b[NR]([1-8])\b")
def nodes_of(s):
    return sorted({"N" + m for m in NODE_RE.findall(s or "")})
def split_alts(s):
    return [x.strip() for x in re.split(r"\s*/\s*|;", s or "") if x.strip() and x.strip() != "-"]

migrations, warnings = [], []

# 01 출처
sources = []
for r in rows("01_Sources"):
    lic = {"NOT_CLEARED": "unknown", "RESTRICTED_OR_UNCHECKED": "restricted"}.get(r["Commercial-use clearance"], "unknown")
    sources.append({"id": r["Source ID"], "title": r["Publisher"], "publisher": r["Publisher"], "url": r["Source URL"],
                    "listed": r["Site-listed records"], "focus": r["Focus"], "capturePolicy": r["Capture policy"],
                    "lang": r["Language"], "license": lic, "licenseNote": r["Rights / caveat"], "checkedOn": r["Checked on"],
                    "clearance": r["Commercial-use clearance"]})
registry_only = {s["id"] for s in sources if s["capturePolicy"] == "REGISTRY_ONLY"}

# 04 분류 (Axis 6개 + Root 8개). Mastery → Adaptability 정정
axes, roots = [], []
for r in rows("04_AP_Taxonomy"):
    if r["Type"] == "AXIS":
        axes.append({"key": r["Key"], "ko": r["한국어 / 영문"], "def": r["Definition"], "rule": r["Rule"]})
    elif r["Type"] == "ROOT":
        name, rule = r["한국어 / 영문"], r["Rule"]
        item = {"key": r["Key"], "name": name, "def": r["Definition"], "rule": rule}
        if r["Key"] == "N8" or name.lower() == "mastery":
            item = {"key": "N8", "name": "Adaptability", "legacyName": name, "def": "상황 적응 및 해법 재구성 (Solution Reconstructed)",
                    "rule": "SUSTAINING", "sub": ["Shot Selection Range", "Adaptive Decision", "Pressure Execution", "Situation-specific Control", "Intentional Curve Creation", "Strategic Reproduction"]}
            migrations.append({"where": "04_AP_Taxonomy/N8", "from": f"{name} — {r['Definition']} ({rule})", "to": "Adaptability — 상황 적응 및 해법 재구성 (SUSTAINING)", "why": "대표 확정 최종 명칭(2026-10-14 변경, AP Swing Learning Matrix v1.2). Mastery는 옛 이름으로만 보관"})
        if r["Key"] == "N5" and "SUSTAINING" not in rule.replace("CREATION–SUSTAINING", ""):
            migrations.append({"where": "04_AP_Taxonomy/N5", "from": rule, "to": "SUSTAINING (Real Impact → Consistency → Efficiency → Adaptability)", "why": "대표 지시: Sustaining Zone = N5→N6→N7→N8"})
            item["rule"] = "SUSTAINING"
        roots.append(item)

# 07 코치 검토
review = {r["AP ID"]: {"status": r["Review status"], "reviewer": r["Reviewer"], "date": r["Date"], "mechanics": r["Mechanics checked"],
                       "indications": r["Indications confirmed"], "contraindications": r["Contraindications"], "measureAgreed": r["Measure agreed"],
                       "fieldPilot": r["AP field pilot"], "remarks": r["Remarks"]} for r in rows("07_Coach_Review")}

# 03 AP 표준 드릴(초안)
drills = []
for r in rows("03_AP_Canonical"):
    axis = r["Axis"]
    raw_node = r["8-node (tentative)"]
    ns = nodes_of(raw_node)
    if "mastery" in raw_node.lower():
        ns = sorted(set(ns) | {"N8"})
        migrations.append({"where": f"03_AP_Canonical/{r['AP ID']}", "from": raw_node, "to": "N8 Adaptability", "why": "Mastery 옛 이름"})
    cross = []
    if axis != "SWING" and ns:      # R09: SWING 이 아닌 Axis 는 노드를 자동 적용하지 않고 교차참조로만
        cross, ns = ns, []
    drills.append({
        "id": r["AP ID"], "nameKo": r["AP 표준명(KO)"], "nameEn": r["Family (EN)"], "axis": axis,
        "nodes": ns, "nodeStatus": "tentative" if ns else "", "nodeCrossRef": cross,
        "symptoms": [r["Observable symptom"]] if r["Observable symptom"] else [],
        "hypotheses": split_alts(r["Candidate causal alternatives"]),
        "how": r["AP intervention summary"], "metrics": [r["Primary measurement"]] if r["Primary measurement"] else [],
        "success": "", "guardrail": r["Interpretation guardrail"], "sourceExample": r["Source example"],
        "evidenceGrade": r["Evidence grade"], "coachApproval": r["Coach approval"] or "PENDING", "versionNote": r["Version note"],
        "coachReview": review.get(r["AP ID"], {}), "draft": True, "evidence": "source",
    })
drill_ids = {d["id"] for d in drills}

# 02 관측 레코드(제목·링크만)
observed, skipped = [], []
for r in rows("02_Observed"):
    if r["Source"] in registry_only:
        skipped.append(r["Record ID"]); continue
    fam = r["Family hypothesis"]
    nh = r["8-node hypothesis"]
    ns = nodes_of(nh)
    if "mastery" in nh.lower():
        ns = sorted(set(ns) | {"N8"}); migrations.append({"where": f"02_Observed/{r['Record ID']}", "from": nh, "to": "N8 Adaptability", "why": "Mastery 옛 이름"})
    if fam not in drill_ids and fam not in ("UNRESOLVED", "FAMILY_AMBIGUOUS", ""):
        warnings.append(f"{r['Record ID']}: 표준 드릴에 없는 family '{fam}'")
    observed.append({"id": r["Record ID"], "source": r["Source"], "title": r["Observed public title"], "axis": r["Axis (provisional)"],
                     "depth": r["Read depth"], "url": r["Original URL"], "family": fam, "mergeNote": r["Merge review note"],
                     "nodes": ns if r["Axis (provisional)"] == "SWING" else [], "nodeCrossRef": ns if r["Axis (provisional)"] != "SWING" else [],
                     "nodeText": nh, "coachVerification": r["Coach verification"], "reusePolicy": r["Reuse policy"],
                     "mapConfidence": r["Map confidence"], "observedOn": r["Observed on"], "recordType": r["Record type"], "remarks": r.get("Coach remarks", "")})

# 06 거버넌스
governance = [{"id": r["Rule"], "policy": r["Policy"], "impl": r["Implementation"], "gate": r["Release gate"], "type": r["Type"]} for r in rows("06_Governance")]

bundle = {"batch": "AP_Global_Training_Library_v0_1", "importedFrom": SRC.split("/")[-1], "builtAt": datetime.date.today().isoformat(),
          "taxonomy": {"axes": axes, "roots": roots, "zones": {"Creation": ["N2", "N3", "N4"], "Sustaining": ["N5", "N6", "N7", "N8"], "Factor": ["N1"]}},
          "governance": governance, "sources": sources, "observed": observed, "drills": drills,
          "migrations": migrations, "warnings": warnings, "skippedRegistryOnly": skipped}
json.dump(bundle, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({"sources": len(sources), "observed": len(observed), "drills": len(drills), "axes": len(axes), "roots": len(roots),
                  "governance": len(governance), "migrations": len(migrations), "warnings": warnings, "skipped": skipped}, ensure_ascii=False, indent=1))
