// 데모용 더미 데이터 — 렌더러/에디터/검증이 각각 의미 있게 보이도록 값 분포를 만든다.

const DEPTS  = ['Engineering', 'Sales', 'Marketing', 'Support', 'Design'];
const GRADES = ['A', 'B', 'C', 'D'];
const SKILLS = ['JS', 'Python', 'SQL', 'Go', 'Rust'];

// 1x1 투명 GIF를 색만 바꿔 쓰기엔 부족하니, 색 블록을 SVG data URI로 만든다(네트워크 불필요).
function avatar(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
    <rect width="48" height="48" fill="hsl(${hue},65%,72%)"/>
    <circle cx="24" cy="18" r="9" fill="hsl(${hue},55%,45%)"/>
    <path d="M6 48c0-10 8-16 18-16s18 6 18 16z" fill="hsl(${hue},55%,45%)"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function makeRows(n = 1000000) {
  return Array.from({ length: n }, (_, i) => {
    const dept = DEPTS[i % DEPTS.length];
    return {
      id:       String(i + 1),
      avatar:   avatar((i * 47) % 360),
      name:     `사용자 ${i + 1}`,
      email:    `user${i + 1}.longaddress@example-company-domain.com`,
      dept,
      skills:   [SKILLS[i % SKILLS.length], SKILLS[(i + 2) % SKILLS.length]].join(','),
      active:   i % 3 !== 0 ? 'true' : 'false',
      verified: i % 4 === 0 ? 'true' : 'false',
      progress: String((i * 17) % 101),
      grade:    GRADES[i % GRADES.length],
      salary:   String(3200000 + ((i * 137) % 5000) * 1000),
      joined:   `20${20 + (i % 5)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      score:    String((i * 37) % 101),
      note:     i % 5 === 0 ? '<b>중요</b> 고객' : i % 5 === 1 ? '<i>검토</i> 필요' : '일반',
    };
  });
}

export const COLUMNS = ['id', 'avatar', 'name', 'email', 'dept', 'skills', 'active',
                        'verified', 'progress', 'grade', 'salary', 'joined', 'score', 'note'];

export const DEPT_OPTIONS  = DEPTS;
export const SKILL_OPTIONS = SKILLS;
export const GRADE_OPTIONS = GRADES;
