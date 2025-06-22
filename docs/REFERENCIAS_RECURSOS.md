# Referências e Recursos

## 📋 Sumário

- [Documentação Oficial](#documentação-oficial)
- [Padrões e Arquiteturas](#padrões-e-arquiteturas)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Artigos e Papers](#artigos-e-papers)
- [Ferramentas de Desenvolvimento](#ferramentas-de-desenvolvimento)
- [Monitoramento e Observabilidade](#monitoramento-e-observabilidade)
- [Segurança](#segurança)
- [Performance e Otimização](#performance-e-otimização)
- [Comunidade e Suporte](#comunidade-e-suporte)
- [Cursos e Treinamentos](#cursos-e-treinamentos)

## 📚 Documentação Oficial

### Node.js e JavaScript

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Node.js Official** | https://nodejs.org/docs/ | Documentação oficial do Node.js |
| **Express.js** | https://expressjs.com/ | Framework web para Node.js |
| **NPM Registry** | https://www.npmjs.com/ | Repositório de pacotes Node.js |
| **JavaScript MDN** | https://developer.mozilla.org/en-US/docs/Web/JavaScript | Referência completa JavaScript |
| **ECMAScript Spec** | https://tc39.es/ecma262/ | Especificação oficial ECMAScript |

### AWS e Cloud Services

| Recurso | URL | Descrição |
|---------|-----|----------|
| **AWS SQS** | https://docs.aws.amazon.com/sqs/ | Amazon Simple Queue Service |
| **AWS SDK for JavaScript** | https://docs.aws.amazon.com/sdk-for-javascript/ | SDK oficial AWS para Node.js |
| **LocalStack** | https://docs.localstack.cloud/ | Emulador local de serviços AWS |
| **AWS Well-Architected** | https://aws.amazon.com/architecture/well-architected/ | Princípios de arquitetura AWS |

### Bancos de Dados

| Recurso | URL | Descrição |
|---------|-----|----------|
| **PostgreSQL** | https://www.postgresql.org/docs/ | Documentação oficial PostgreSQL |
| **Redis** | https://redis.io/documentation | Documentação oficial Redis |
| **Sequelize** | https://sequelize.org/docs/ | ORM para Node.js |
| **Prisma** | https://www.prisma.io/docs | ORM moderno para Node.js |

### Containerização e Orquestração

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Docker** | https://docs.docker.com/ | Documentação oficial Docker |
| **Docker Compose** | https://docs.docker.com/compose/ | Orquestração de containers |
| **Kubernetes** | https://kubernetes.io/docs/ | Orquestração de containers |
| **Helm** | https://helm.sh/docs/ | Gerenciador de pacotes Kubernetes |

## 🏗️ Padrões e Arquiteturas

### Event-Driven Architecture (EDA)

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Event-Driven Architecture** | https://martinfowler.com/articles/201701-event-driven.html | Artigo fundamental por Martin Fowler |
| **Event Sourcing** | https://martinfowler.com/eaaDev/EventSourcing.html | Padrão Event Sourcing |
| **CQRS Pattern** | https://martinfowler.com/bliki/CQRS.html | Command Query Responsibility Segregation |
| **Saga Pattern** | https://microservices.io/patterns/data/saga.html | Padrão para transações distribuídas |
| **Event Storming** | https://www.eventstorming.com/ | Técnica de modelagem colaborativa |

### Microservices

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Microservices.io** | https://microservices.io/ | Padrões de microservices |
| **Building Microservices** | https://samnewman.io/books/building_microservices/ | Livro de Sam Newman |
| **Circuit Breaker** | https://martinfowler.com/bliki/CircuitBreaker.html | Padrão Circuit Breaker |
| **API Gateway** | https://microservices.io/patterns/apigateway.html | Padrão API Gateway |
| **Service Mesh** | https://istio.io/latest/docs/concepts/what-is-istio/ | Conceitos de Service Mesh |

### Multi-Agent Systems (MAS)

| Recurso | URL | Descrição |
|---------|-----|----------|
| **FIPA Standards** | http://www.fipa.org/repository/standardspecs.html | Padrões para agentes inteligentes |
| **BDI Architecture** | https://en.wikipedia.org/wiki/Belief%E2%80%93desire%E2%80%93intention_software_model | Modelo Belief-Desire-Intention |
| **JADE Framework** | https://jade.tilab.com/ | Framework para sistemas multi-agente |
| **Agent Communication** | https://www.fipa.org/specs/fipa00061/ | Linguagem de comunicação entre agentes |
| **Coordination Protocols** | https://www.fipa.org/specs/fipa00029/ | Protocolos de coordenação |

### Multi-Agent Reinforcement Learning (MARL)

| Recurso | URL | Descrição |
|---------|-----|----------|
| **OpenAI Multi-Agent** | https://openai.com/research/emergent-tool-use | Pesquisa em MARL |
| **DeepMind MARL** | https://deepmind.com/research/publications/multi-agent-reinforcement-learning | Papers sobre MARL |
| **MADDPG Paper** | https://arxiv.org/abs/1706.02275 | Multi-Agent Deep Deterministic Policy Gradient |
| **QMIX Paper** | https://arxiv.org/abs/1803.11485 | QMIX: Monotonic Value Function Factorisation |
| **PyMARL** | https://github.com/oxwhirl/pymarl | Framework Python para MARL |

## 🛠️ Tecnologias Utilizadas

### Frameworks e Bibliotecas

| Tecnologia | Versão | URL | Uso no Projeto |
|------------|--------|-----|----------------|
| **Express.js** | ^4.18.0 | https://expressjs.com/ | Framework web principal |
| **Helmet** | ^7.0.0 | https://helmetjs.github.io/ | Segurança HTTP |
| **CORS** | ^2.8.5 | https://github.com/expressjs/cors | Cross-Origin Resource Sharing |
| **Winston** | ^3.10.0 | https://github.com/winstonjs/winston | Sistema de logging |
| **Joi** | ^17.9.0 | https://joi.dev/ | Validação de dados |
| **Prometheus Client** | ^14.2.0 | https://github.com/siimon/prom-client | Métricas e monitoramento |
| **AWS SDK** | ^3.0.0 | https://docs.aws.amazon.com/sdk-for-javascript/ | Integração com AWS |
| **Sequelize** | ^6.32.0 | https://sequelize.org/ | ORM para PostgreSQL |
| **Redis** | ^4.6.0 | https://github.com/redis/node-redis | Cliente Redis |

### Ferramentas de Desenvolvimento

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **ESLint** | https://eslint.org/ | Linter para JavaScript |
| **Prettier** | https://prettier.io/ | Formatador de código |
| **Jest** | https://jestjs.io/ | Framework de testes |
| **Supertest** | https://github.com/visionmedia/supertest | Testes de API |
| **Nodemon** | https://nodemon.io/ | Monitor de arquivos para desenvolvimento |
| **PM2** | https://pm2.keymetrics.io/ | Gerenciador de processos |

### Infraestrutura

| Tecnologia | URL | Descrição |
|------------|-----|----------|
| **Docker** | https://www.docker.com/ | Containerização |
| **Docker Compose** | https://docs.docker.com/compose/ | Orquestração local |
| **Kubernetes** | https://kubernetes.io/ | Orquestração em produção |
| **Grafana** | https://grafana.com/ | Visualização de métricas |
| **Prometheus** | https://prometheus.io/ | Sistema de monitoramento |
| **Jaeger** | https://www.jaegertracing.io/ | Distributed tracing |

## 📖 Artigos e Papers

### Arquitetura de Software

| Título | Autor | URL | Relevância |
|--------|-------|-----|------------|
| **The Reactive Manifesto** | Jonas Bonér et al. | https://www.reactivemanifesto.org/ | Princípios de sistemas reativos |
| **Building Event-Driven Microservices** | Adam Bellemare | https://www.oreilly.com/library/view/building-event-driven-microservices/9781492057888/ | Livro sobre EDA e microservices |
| **Patterns of Enterprise Application Architecture** | Martin Fowler | https://martinfowler.com/books/eaa.html | Padrões fundamentais |
| **Clean Architecture** | Robert C. Martin | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html | Arquitetura limpa |
| **Domain-Driven Design** | Eric Evans | https://domainlanguage.com/ddd/ | Design orientado a domínio |

### Sistemas Distribuídos

| Título | Autor | URL | Relevância |
|--------|-------|-----|------------|
| **CAP Theorem** | Eric Brewer | https://en.wikipedia.org/wiki/CAP_theorem | Teorema fundamental |
| **Eventual Consistency** | Werner Vogels | https://www.allthingsdistributed.com/2008/12/eventually_consistent.html | Consistência eventual |
| **Fallacies of Distributed Computing** | Peter Deutsch | https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing | Falácias comuns |
| **Designing Data-Intensive Applications** | Martin Kleppmann | https://dataintensive.net/ | Livro sobre sistemas de dados |

### Inteligência Artificial e Agentes

| Título | Autor | URL | Relevância |
|--------|-------|-----|------------|
| **Artificial Intelligence: A Modern Approach** | Stuart Russell, Peter Norvig | https://aima.cs.berkeley.edu/ | Livro fundamental de IA |
| **Multi-Agent Systems** | Gerhard Weiss | https://www.multiagent.com/ | Sistemas multi-agente |
| **Reinforcement Learning: An Introduction** | Richard Sutton, Andrew Barto | http://incompleteideas.net/book/the-book.html | Aprendizado por reforço |
| **BDI Agent Programming** | Rafael Bordini et al. | https://link.springer.com/book/10.1007/0-387-31712-1 | Programação de agentes BDI |

## 🔧 Ferramentas de Desenvolvimento

### IDEs e Editores

| Ferramenta | URL | Plugins Recomendados |
|------------|-----|---------------------|
| **Visual Studio Code** | https://code.visualstudio.com/ | ESLint, Prettier, Docker, REST Client |
| **WebStorm** | https://www.jetbrains.com/webstorm/ | Node.js, Docker, Database Tools |
| **Vim/Neovim** | https://neovim.io/ | coc.nvim, vim-node, vim-docker |
| **Sublime Text** | https://www.sublimetext.com/ | SublimeLinter, Package Control |

### Debugging e Profiling

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **Node.js Inspector** | https://nodejs.org/en/docs/guides/debugging-getting-started/ | Debugger nativo |
| **Chrome DevTools** | https://developers.google.com/web/tools/chrome-devtools | Debugging no browser |
| **Clinic.js** | https://clinicjs.org/ | Profiling de performance |
| **0x** | https://github.com/davidmarkclements/0x | Flame graphs para Node.js |
| **Artillery** | https://artillery.io/ | Load testing |

### Testes

| Ferramenta | URL | Tipo de Teste |
|------------|-----|---------------|
| **Jest** | https://jestjs.io/ | Unit, Integration |
| **Mocha** | https://mochajs.org/ | Unit, Integration |
| **Chai** | https://www.chaijs.com/ | Assertions |
| **Sinon** | https://sinonjs.org/ | Mocks e Stubs |
| **Supertest** | https://github.com/visionmedia/supertest | API Testing |
| **Testcontainers** | https://www.testcontainers.org/ | Integration Testing |
| **K6** | https://k6.io/ | Load Testing |
| **Postman** | https://www.postman.com/ | API Testing |

## 📊 Monitoramento e Observabilidade

### Métricas e Alertas

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **Prometheus** | https://prometheus.io/ | Sistema de métricas |
| **Grafana** | https://grafana.com/ | Visualização de dados |
| **AlertManager** | https://prometheus.io/docs/alerting/latest/alertmanager/ | Gerenciamento de alertas |
| **PagerDuty** | https://www.pagerduty.com/ | Incident management |
| **Datadog** | https://www.datadoghq.com/ | Plataforma de monitoramento |
| **New Relic** | https://newrelic.com/ | APM e monitoramento |

### Logging

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **ELK Stack** | https://www.elastic.co/elastic-stack/ | Elasticsearch, Logstash, Kibana |
| **Fluentd** | https://www.fluentd.org/ | Coletor de logs |
| **Loki** | https://grafana.com/oss/loki/ | Sistema de logs da Grafana |
| **Winston** | https://github.com/winstonjs/winston | Logger para Node.js |
| **Bunyan** | https://github.com/trentm/node-bunyan | Logger estruturado |

### Tracing

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **Jaeger** | https://www.jaegertracing.io/ | Distributed tracing |
| **Zipkin** | https://zipkin.io/ | Distributed tracing |
| **OpenTelemetry** | https://opentelemetry.io/ | Observability framework |
| **AWS X-Ray** | https://aws.amazon.com/xray/ | Tracing para AWS |

## 🔒 Segurança

### Frameworks e Bibliotecas

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **Helmet.js** | https://helmetjs.github.io/ | Segurança HTTP |
| **OWASP** | https://owasp.org/ | Projeto de segurança web |
| **Snyk** | https://snyk.io/ | Análise de vulnerabilidades |
| **ESLint Security** | https://github.com/nodesecurity/eslint-plugin-security | Plugin de segurança |
| **JWT.io** | https://jwt.io/ | JSON Web Tokens |

### Guias e Checklists

| Recurso | URL | Descrição |
|---------|-----|----------|
| **OWASP Top 10** | https://owasp.org/www-project-top-ten/ | Top 10 vulnerabilidades |
| **Node.js Security** | https://nodejs.org/en/docs/guides/security/ | Guia oficial de segurança |
| **Express Security** | https://expressjs.com/en/advanced/best-practice-security.html | Melhores práticas |
| **Docker Security** | https://docs.docker.com/engine/security/ | Segurança em containers |
| **Kubernetes Security** | https://kubernetes.io/docs/concepts/security/ | Segurança em K8s |

## ⚡ Performance e Otimização

### Ferramentas de Análise

| Ferramenta | URL | Descrição |
|------------|-----|----------|
| **Clinic.js** | https://clinicjs.org/ | Suite de profiling |
| **0x** | https://github.com/davidmarkclements/0x | Flame graphs |
| **AutoCannon** | https://github.com/mcollina/autocannon | HTTP benchmarking |
| **Lighthouse** | https://developers.google.com/web/tools/lighthouse | Auditoria web |
| **WebPageTest** | https://www.webpagetest.org/ | Teste de performance web |

### Guias de Otimização

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Node.js Performance** | https://nodejs.org/en/docs/guides/simple-profiling/ | Guia oficial |
| **Express Performance** | https://expressjs.com/en/advanced/best-practice-performance.html | Melhores práticas |
| **Database Optimization** | https://use-the-index-luke.com/ | Otimização de SQL |
| **Redis Performance** | https://redis.io/topics/benchmarks | Benchmarks Redis |

## 👥 Comunidade e Suporte

### Fóruns e Comunidades

| Plataforma | URL | Descrição |
|------------|-----|----------|
| **Stack Overflow** | https://stackoverflow.com/questions/tagged/node.js | Q&A técnico |
| **Reddit Node.js** | https://www.reddit.com/r/node/ | Comunidade Node.js |
| **Discord Node.js** | https://discord.gg/96WGtJt | Chat da comunidade |
| **GitHub Discussions** | https://github.com/nodejs/node/discussions | Discussões oficiais |
| **Dev.to** | https://dev.to/t/nodejs | Artigos e tutoriais |

### Eventos e Conferências

| Evento | URL | Descrição |
|--------|-----|----------|
| **NodeConf** | https://nodeconf.com/ | Conferência Node.js |
| **JSConf** | https://jsconf.com/ | Conferência JavaScript |
| **DockerCon** | https://www.docker.com/dockercon/ | Conferência Docker |
| **KubeCon** | https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/ | Conferência Kubernetes |
| **AWS re:Invent** | https://reinvent.awsevents.com/ | Conferência AWS |

### Newsletters e Blogs

| Recurso | URL | Descrição |
|---------|-----|----------|
| **Node Weekly** | https://nodeweekly.com/ | Newsletter semanal |
| **JavaScript Weekly** | https://javascriptweekly.com/ | Newsletter JavaScript |
| **AWS News** | https://aws.amazon.com/new/ | Novidades AWS |
| **Docker Blog** | https://www.docker.com/blog/ | Blog oficial Docker |
| **Kubernetes Blog** | https://kubernetes.io/blog/ | Blog oficial Kubernetes |

## 🎓 Cursos e Treinamentos

### Plataformas Online

| Plataforma | URL | Cursos Relevantes |
|------------|-----|------------------|
| **Coursera** | https://www.coursera.org/ | Node.js, Microservices, Cloud Computing |
| **Udemy** | https://www.udemy.com/ | Express.js, Docker, AWS |
| **Pluralsight** | https://www.pluralsight.com/ | Node.js, Kubernetes, DevOps |
| **edX** | https://www.edx.org/ | Computer Science, AI |
| **Linux Academy** | https://linuxacademy.com/ | Cloud, DevOps, Containers |

### Certificações

| Certificação | URL | Descrição |
|--------------|-----|----------|
| **AWS Certified** | https://aws.amazon.com/certification/ | Certificações AWS |
| **Docker Certified** | https://training.mirantis.com/certification/ | Certificação Docker |
| **Kubernetes Certified** | https://www.cncf.io/certification/cka/ | CKA, CKAD, CKS |
| **Node.js Certified** | https://openjsf.org/certification/ | Certificação OpenJS |

### Livros Recomendados

| Título | Autor | URL | Tópico |
|--------|-------|-----|--------|
| **Node.js Design Patterns** | Mario Casciaro | https://www.nodejsdesignpatterns.com/ | Padrões Node.js |
| **Building Microservices** | Sam Newman | https://samnewman.io/books/building_microservices/ | Microservices |
| **Designing Data-Intensive Applications** | Martin Kleppmann | https://dataintensive.net/ | Sistemas distribuídos |
| **Clean Code** | Robert C. Martin | https://www.oreilly.com/library/view/clean-code-a/9780136083238/ | Qualidade de código |
| **Site Reliability Engineering** | Google | https://sre.google/books/ | SRE e DevOps |

## 🔗 Links Úteis do Projeto

### Repositórios Relacionados

| Repositório | URL | Descrição |
|-------------|-----|----------|
| **Projeto Principal** | https://github.com/seu-usuario/agentes-autonomos | Código fonte principal |
| **Documentação** | https://github.com/seu-usuario/agentes-autonomos-docs | Documentação estendida |
| **Exemplos** | https://github.com/seu-usuario/agentes-autonomos-examples | Exemplos de uso |
| **SDKs** | https://github.com/seu-usuario/agentes-autonomos-sdk | SDKs para diferentes linguagens |

### Ferramentas de Desenvolvimento

| Ferramenta | URL | Configuração |
|------------|-----|-------------|
| **CI/CD Pipeline** | https://github.com/actions | `.github/workflows/` |
| **Code Quality** | https://sonarcloud.io/ | Análise de qualidade |
| **Dependency Check** | https://dependabot.com/ | Atualizações automáticas |
| **Security Scan** | https://snyk.io/ | Análise de vulnerabilidades |

### Ambientes

| Ambiente | URL | Descrição |
|----------|-----|----------|
| **Desenvolvimento** | http://localhost:3000 | Ambiente local |
| **Staging** | https://staging.agentes-autonomos.com | Ambiente de testes |
| **Produção** | https://agentes-autonomos.com | Ambiente de produção |
| **Monitoramento** | https://monitoring.agentes-autonomos.com | Dashboards Grafana |

## 📝 Contribuindo

### Guias de Contribuição

| Documento | Localização | Descrição |
|-----------|-------------|----------|
| **Contributing Guide** | `CONTRIBUTING.md` | Como contribuir |
| **Code of Conduct** | `CODE_OF_CONDUCT.md` | Código de conduta |
| **Issue Templates** | `.github/ISSUE_TEMPLATE/` | Templates para issues |
| **PR Templates** | `.github/PULL_REQUEST_TEMPLATE.md` | Template para PRs |

### Processo de Desenvolvimento

1. **Fork** do repositório
2. **Clone** do fork
3. **Branch** para feature/bugfix
4. **Desenvolvimento** com testes
5. **Commit** seguindo convenções
6. **Push** para o fork
7. **Pull Request** para o repositório principal
8. **Review** e merge

### Convenções

| Tipo | Convenção | Exemplo |
|------|-----------|--------|
| **Commits** | Conventional Commits | `feat: add new agent type` |
| **Branches** | GitFlow | `feature/new-agent-type` |
| **Versioning** | Semantic Versioning | `1.2.3` |
| **Changelog** | Keep a Changelog | `CHANGELOG.md` |

---

## 📞 Suporte

Para suporte técnico ou dúvidas:

- **Issues**: https://github.com/seu-usuario/agentes-autonomos/issues
- **Discussions**: https://github.com/seu-usuario/agentes-autonomos/discussions
- **Email**: suporte@agentes-autonomos.com
- **Slack**: #agentes-autonomos

---

*Documentação atualizada regularmente - Última revisão: $(date)*