const { createApp } = Vue;

createApp({
  data() {
    return {
      runners: [],
      pageSize: 100,
      loading: true,
      error: '',
      finishTooltip: null,
    };
  },
  computed: {
    visibleRunners() {
      return this.runners.slice(0, this.pageSize);
    },
    totalRunners() {
      return this.runners.length;
    },
    eliteCount() {
      return this.runners.filter((runner) => runner.class === 'elite').length;
    },
    amateurCount() {
      return this.runners.filter((runner) => runner.class === 'amateur').length;
    },
    parsedRunners() {
      return this.runners.map((runner) => {
        const parts = (runner.country_age || '').split(',').map((part) => part.trim());
        const ageMatch = (parts[1] || '').match(/([MF])\s*(\d+)/i);
        const gender = ageMatch ? ageMatch[1].toUpperCase() : 'U';
        const age = ageMatch ? Number(ageMatch[2]) : null;
        const finishSeconds = this.toSeconds(runner.finish_time);
        return { ...runner, country: parts[0] || 'Неизвестно', gender, age, finishSeconds };
      });
    },
    menCount() { return this.parsedRunners.filter((runner) => runner.gender === 'M').length; },
    womenCount() { return this.parsedRunners.filter((runner) => runner.gender === 'F').length; },
    menPercent() { return this.totalRunners ? Math.round(this.menCount / this.totalRunners * 100) : 0; },
    womenPercent() { return this.totalRunners ? Math.round(this.womenCount / this.totalRunners * 100) : 0; },
    ageRange() {
      const ages = this.parsedRunners.map((runner) => runner.age).filter(Boolean);
      return { min: Math.min(...ages), max: Math.max(...ages) };
    },
    topCountries() {
      const total = this.totalRunners || 1;
      const counts = d3.rollups(this.parsedRunners, (rows) => rows.length, (runner) => runner.country)
        .sort((a, b) => b[1] - a[1]).slice(0, 7);
      return counts.map(([name, count]) => ({ name, count, percent: Math.round(count / total * 100) }));
    },
    leaders() {
      return ['M', 'F'].flatMap((gender) => this.parsedRunners.filter((runner) => runner.gender === gender && runner.finishSeconds)
        .sort((a, b) => a.finishSeconds - b.finishSeconds).slice(0, 3)
        .map((runner, index) => ({ ...runner, genderPlace: index + 1 })));
    },
  },
  methods: {
    categoryLabel(category) {
      return category === 'elite' ? 'Элита' : 'Любители';
    },
    toSeconds(value) {
      if (!value || value === 'DQ' || value === '-') return null;
      const parts = value.split(':').map(Number);
      if (parts.some(Number.isNaN)) return null;
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    },
    renderCharts() {
      if (!this.runners.length) return;
      this.renderAgeChart();
      this.renderFinishChart();
    },
    renderAgeChart() {
      const svg = d3.select(this.$refs.ageChart); svg.selectAll('*').remove();
      const width = 300, height = 310, margin = { top: 8, right: 32, bottom: 20, left: 32 };
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      const ages = d3.range(this.ageRange.min, this.ageRange.max + 1);
      const grouped = d3.rollup(this.parsedRunners, (rows) => ({ M: rows.filter((r) => r.gender === 'M').length, F: rows.filter((r) => r.gender === 'F').length }), (r) => r.age);
      const max = d3.max(ages, (age) => Math.max(grouped.get(age)?.M || 0, grouped.get(age)?.F || 0));
      const x = d3.scaleLinear().domain([-max, max]).range([margin.left, width - margin.right]);
      const y = d3.scaleBand().domain(ages).range([margin.top, height - margin.bottom]).padding(.2);
      svg.append('g').selectAll('line').data(ages.filter((age) => age % 5 === 0)).join('line').attr('x1', margin.left).attr('x2', width - margin.right).attr('y1', (age) => y(age) + y.bandwidth() / 2).attr('y2', (age) => y(age) + y.bandwidth() / 2).attr('stroke', '#e4e6e8');
      const bars = ages.flatMap((age) => [{ age, gender: 'M', value: -(grouped.get(age)?.M || 0) }, { age, gender: 'F', value: grouped.get(age)?.F || 0 }]);
      svg.append('g').selectAll('rect').data(bars).join('rect').attr('x', (d) => Math.min(x(0), x(d.value))).attr('y', (d) => y(d.age)).attr('width', (d) => Math.abs(x(d.value) - x(0))).attr('height', y.bandwidth()).attr('fill', (d) => d.gender === 'M' ? '#58aee7' : '#f39aaa').on('mouseenter', (event, d) => this.showTooltip(event, `${d.age} лет · ${d.gender === 'M' ? 'мужчины' : 'женщины'}: ${Math.abs(d.value)}`)).on('mouseleave', () => this.hideTooltip());
      svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', margin.top).attr('y2', height - margin.bottom).attr('stroke', '#cbd0d6');
      svg.append('g').attr('transform', `translate(${width - margin.right + 7},0)`).call(d3.axisRight(y).tickValues(ages.filter((age) => age % 5 === 0)).tickSize(0)).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('text').attr('fill', '#92979d').attr('font-size', 11));
    },
    renderFinishChart() {
      const svg = d3.select(this.$refs.finishChart); svg.selectAll('*').remove();
      const width = 1160, height = 390, margin = { top: 18, right: 16, bottom: 42, left: 16 };
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      const rows = this.parsedRunners.filter((r) => r.finishSeconds).sort((a, b) => Math.floor(a.finishSeconds / 60) - Math.floor(b.finishSeconds / 60) || ({ M: 0, F: 1, U: 2 }[a.gender] - ({ M: 0, F: 1, U: 2 }[b.gender])) || (a.age || 0) - (b.age || 0));
      const extent = d3.extent(rows, (r) => r.finishSeconds); const x = d3.scaleLinear().domain([extent[0] - 30, extent[1] + 30]).range([margin.left, width - margin.right]);
      const grouped = d3.group(rows, (r) => Math.floor(r.finishSeconds / 60));
      const maxInMinute = d3.max([...grouped.values()], (items) => items.length) || 1;
      // Одна общая шкала для обоих полов: высота стека показывает реальное
      // соотношение мужчин и женщин, а не две независимо нормализованные серии.
      const plotHeight = height - margin.top - margin.bottom - 24;
      const rowHeight = Math.max(0.65, Math.min(4, plotHeight / maxInMinute * 0.82));
      const baseline = height - margin.bottom;
      svg.append('g').selectAll('rect').data(rows).join('rect')
        .attr('x', (d) => x(d.finishSeconds) - 1.1)
        .attr('y', (d) => {
          const items = grouped.get(Math.floor(d.finishSeconds / 60));
          return baseline - (items.indexOf(d) + 1) * rowHeight;
        })
        .attr('width', 2.2)
        .attr('height', Math.max(1.4, rowHeight * .86))
        .attr('fill', (d) => d.gender === 'F' ? '#f39aaa' : '#58aee7')
        .attr('opacity', .92)
        .on('mouseenter', (event, d) => this.showTooltip(event, `<strong>${d.name}</strong><br>${d.finish_time} · ${d.age || '—'} лет<br>№ ${d.bib_number}`))
        .on('mouseleave', () => this.hideTooltip());
      const ticks = d3.axisBottom(x).ticks(8).tickFormat((seconds) => new Date(seconds * 1000).toISOString().slice(11, 19));
      svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(ticks).call((g) => g.select('.domain').attr('stroke', '#cbd0d6')).call((g) => g.selectAll('text').attr('font-size', 11));
      svg.append('text').attr('x', margin.left).attr('y', 14).attr('fill', '#92979d').attr('font-size', 11).text('мужчины'); svg.append('text').attr('x', margin.left + 66).attr('y', 14).attr('fill', '#92979d').attr('font-size', 11).text('женщины');
    },
    showTooltip(event, html) { this.finishTooltip = { x: event.clientX + 12, y: event.clientY + 12, html }; },
    hideTooltip() { this.finishTooltip = null; },
  },
  async mounted() {
    try {
      const response = await fetch('results.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.runners = await response.json();
      this.$nextTick(() => this.renderCharts());
    } catch (error) {
      this.error = `Не удалось загрузить results.json: ${error.message}`;
    } finally {
      this.loading = false;
    }
  },
}).mount('#app');
