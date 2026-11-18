import json, sys
src, start, end, video, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
T = json.load(open(src))
keys = ['tEnter', 'tQueue', 'tOrder', 'tServed', 'tSeated', 'tExit', 'lastSeen']
J = []
for j in T['journeys']:
    if j['tEnter'] is None or j['tEnter'] >= end or (j.get('tExit') is not None and j['tExit'] <= start):
        continue
    n = dict(j)
    n['dayId'] = j['id']
    for k in keys:
        v = j.get(k)
        n[k] = round(v - start, 1) if v is not None and start <= v <= end else None
    n['insideAtStart'] = j['tEnter'] < start
    n['lateInFullDay'] = j.get('late')
    n.pop('late', None)
    J.append(n)
for i, n in enumerate(J):
    n['id'] = i + 1
d = {k: v for k, v in T.items() if k not in ('journeys',)}
d.update(video=video, duration=end - start, clipOfFullDay={'from': start, 'to': end, 'fullVideo': T.get('video')}, journeys=J)
d['note'] = ('One minute cut from the simulated day (seed 17). Times are seconds from the start of this clip; '
             'a stage that happened before or after the clip is null. insideAtStart = the customer was already in the cafe. '
             'lateInFullDay = whether the order was late (>= 8 min) over the whole day; it cannot be judged inside one minute.')
json.dump(d, open(out, 'w'), indent=1, ensure_ascii=False)
print(len(J), 'customers;', sum(n['insideAtStart'] for n in J), 'already inside;',
      {k: sum(n[k] is not None for n in J) for k in keys[:6]})
