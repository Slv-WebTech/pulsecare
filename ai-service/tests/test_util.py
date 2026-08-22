import json

import pytest

from util import parse_json_response


def test_parses_plain_json():
    assert parse_json_response('{"a": 1}') == {"a": 1}


def test_strips_json_language_fence():
    text = '```json\n{"a": 1}\n```'
    assert parse_json_response(text) == {"a": 1}


def test_strips_bare_fence():
    text = '```\n{"a": 1}\n```'
    assert parse_json_response(text) == {"a": 1}


def test_strips_surrounding_whitespace():
    text = '   \n {"a": 1} \n  '
    assert parse_json_response(text) == {"a": 1}


def test_raises_on_invalid_json():
    with pytest.raises(json.JSONDecodeError):
        parse_json_response("this is not json")
