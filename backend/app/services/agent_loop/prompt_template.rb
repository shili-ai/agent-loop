module AgentLoop
  # Đọc prompt từ file markdown trong thư mục prompts/ và thay biến {{ten_bien}}.
  # Giúp tách toàn bộ prompt của hệ thống ra khỏi code Ruby.
  class PromptTemplate
    DIR = File.expand_path("prompts", __dir__)

    def self.render(name, vars = {})
      template = File.read(File.join(DIR, "#{name}.md"))
      vars.each { |key, value| template = template.gsub("{{#{key}}}", value.to_s) }
      template
    end
  end
end
