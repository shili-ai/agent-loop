module AgentLoop
  class SystemPromptCatalog
    PURPOSES = [
      { key: :analysis, label: "Phân tích", template: "analysis_system" },
      { key: :decider, label: "Chọn action", template: "decider_system" },
      { key: :answer, label: "Trả lời", template: "answer_system" },
      { key: :clarification, label: "Hỏi làm rõ", template: "clarification_system" }
    ].freeze

    def call
      PURPOSES.map do |purpose|
        base_system = base_system_prompt(purpose[:template])
        composer = PromptComposer.new(
          base_system: base_system,
          context: preview_context,
          purpose: purpose[:key]
        )

        {
          key: purpose[:key],
          label: purpose[:label],
          base_system: base_system,
          composed_system: composer.system_prompt,
          layers: composer.prompt_layer_summary
        }
      end
    end

    private

    def base_system_prompt(template)
      if template == "decider_system"
        PromptTemplate.render(
          template,
          action_catalog: action_catalog,
          action_keys: ModelActionDecider::ACTIONS.keys.join(", ")
        )
      else
        PromptTemplate.render(template)
      end
    end

    def preview_context
      {
        skills: enabled_system_skills,
        project: {},
        conversation: {}
      }
    end

    def enabled_system_skills
      AgentSkill.default_presales!
      AgentSkill.where(enabled: true).order(:priority, :name).map do |skill|
        {
          id: skill.id,
          key: skill.key,
          name: skill.name,
          description: skill.description,
          priority: skill.priority,
          scope: "system",
          prompts: {
            analysis: skill.analysis_prompt,
            decider: skill.decider_prompt,
            answer: skill.answer_prompt,
            clarification: skill.clarification_prompt
          }.compact_blank,
          tool_policy: skill.tool_policy || {}
        }
      end
    end

    def action_catalog
      ModelActionDecider::ACTIONS.map { |name, description| "- #{name}: #{description}" }.join("\n")
    end
  end
end
