module AgentLoop
  class DocumentTextExtractor
    TEXT_EXTENSIONS = %w[.txt .md .markdown .csv .tsv .json .html .htm .xml .yaml .yml .log].freeze
    MAX_CHARS = 120_000

    def initialize(file:)
      @file = file
    end

    def call
      return "" unless text_like?

      raw = @file.read.to_s
      @file.rewind if @file.respond_to?(:rewind)
      clean(raw)
    end

    private

    def text_like?
      extension = File.extname(filename).downcase
      return true if TEXT_EXTENSIONS.include?(extension)

      content_type.start_with?("text/") ||
        content_type.include?("json") ||
        content_type.include?("xml") ||
        content_type.include?("csv")
    end

    def filename
      @file.original_filename.to_s
    end

    def content_type
      @file.content_type.to_s
    end

    def clean(text)
      # Uploaded bytes come in as ASCII-8BIT. Treat them as UTF-8 (the common
      # case for text uploads) and scrub only the genuinely invalid byte
      # sequences — encoding *from* ASCII-8BIT would drop every multi-byte
      # char (e.g. Vietnamese diacritics) as "undefined".
      utf8 = text.dup.force_encoding("UTF-8")
      utf8 = utf8.scrub("") unless utf8.valid_encoding?
      utf8
        .gsub(/\r\n?/, "\n")
        .gsub(/[ \t]+/, " ")
        .gsub(/\n{4,}/, "\n\n\n")
        .strip
        .first(MAX_CHARS)
    end
  end
end
