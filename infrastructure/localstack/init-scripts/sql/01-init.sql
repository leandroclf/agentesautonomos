-- Inicialização do banco de dados para Agentes Autônomos

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Criar schema para agentes
CREATE SCHEMA IF NOT EXISTS agentes;

-- Tabela de eventos
CREATE TABLE IF NOT EXISTS agentes.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Tabela de planos
CREATE TABLE IF NOT EXISTS agentes.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES agentes.events(id),
    plan_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    plan_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    priority INTEGER DEFAULT 5,
    estimated_duration INTEGER, -- em segundos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(100)
);

-- Tabela de execuções
CREATE TABLE IF NOT EXISTS agentes.executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES agentes.plans(id),
    agent_id VARCHAR(100) NOT NULL,
    execution_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'queued',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- em segundos
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de métricas
CREATE TABLE IF NOT EXISTS agentes.metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(50),
    tags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de políticas
CREATE TABLE IF NOT EXISTS agentes.policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name VARCHAR(200) NOT NULL UNIQUE,
    policy_type VARCHAR(100) NOT NULL,
    policy_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    version INTEGER DEFAULT 1
);

-- Tabela de violações de política
CREATE TABLE IF NOT EXISTS agentes.policy_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID REFERENCES agentes.policies(id),
    agent_id VARCHAR(100) NOT NULL,
    violation_type VARCHAR(100) NOT NULL,
    violation_data JSONB NOT NULL,
    severity VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'open',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON agentes.events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON agentes.events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON agentes.events(created_at);

CREATE INDEX IF NOT EXISTS idx_plans_event_id ON agentes.plans(event_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON agentes.plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_priority ON agentes.plans(priority);

CREATE INDEX IF NOT EXISTS idx_executions_plan_id ON agentes.executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON agentes.executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON agentes.executions(agent_id);

CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON agentes.metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON agentes.metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON agentes.metrics(metric_name);

CREATE INDEX IF NOT EXISTS idx_policies_active ON agentes.policies(is_active);
CREATE INDEX IF NOT EXISTS idx_policies_type ON agentes.policies(policy_type);

CREATE INDEX IF NOT EXISTS idx_violations_policy_id ON agentes.policy_violations(policy_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON agentes.policy_violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON agentes.policy_violations(detected_at);

-- Inserir políticas padrão
INSERT INTO agentes.policies (policy_name, policy_type, policy_data, priority) VALUES
('max_execution_time', 'execution', '{"max_duration_seconds": 300, "action": "terminate"}', 1),
('max_retry_attempts', 'execution', '{"max_retries": 3, "backoff_multiplier": 2}', 2),
('resource_limits', 'system', '{"max_memory_mb": 512, "max_cpu_percent": 80}', 3),
('security_validation', 'security', '{"require_authentication": true, "validate_input": true}', 1),
('audit_logging', 'compliance', '{"log_all_actions": true, "retention_days": 90}', 4)
ON CONFLICT (policy_name) DO NOTHING;

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON agentes.events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON agentes.plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_executions_updated_at BEFORE UPDATE ON agentes.executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON agentes.policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
