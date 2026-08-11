# Lightweight .env loader for local development without adding a gem.
# Existing shell env always wins.
env_path = Rails.root.join(".env")

if env_path.exist?
  env_path.each_line do |line|
    stripped = line.strip
    next if stripped.blank? || stripped.start_with?("#")
    next unless stripped.include?("=")

    key, value = stripped.split("=", 2)
    key = key.to_s.strip
    value = value.to_s.strip
    value = value[1...-1] if value.length >= 2 && value.start_with?('"') && value.end_with?('"')
    ENV[key] ||= value
  end
end
