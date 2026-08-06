# syntax=docker/dockerfile:1

ARG RUBY_VERSION=3.4.5
FROM ruby:${RUBY_VERSION}-slim

WORKDIR /rails

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential curl git libvips libyaml-dev pkg-config sqlite3 && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY Gemfile Gemfile.lock ./
RUN bundle install

EXPOSE 3000
CMD ["bash", "-lc", "bundle install && bin/rails db:prepare && bin/rails server -b 0.0.0.0 -p 3000"]
